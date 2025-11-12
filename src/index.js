import { loadEnv, createLogger } from 'vite'
import { spawn, execFileSync } from 'child_process'
import colors from 'picocolors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import yaml from 'js-yaml'

/**
 * Vite plugin for integrating Cloudflare Tunnel with your development server
 * @param {Object} [config] - Configuration options
 * @param {string} [config.logLevel='warn'] - Log level for console output ('info'|'warn'|'error')
 * @returns {Object} Vite plugin object
 */
export default function cloudflared(config = {}) {
    const pluginConfig = resolvePluginConfig(config)

    let cloudflaredConfig
    let resolvedConfig
    let cloudflaredProcess
    let cleaningUpCloudflaredProcess = false
    let exitHandlersBound = false

    const logger = createLogger(pluginConfig.logLevel, {
        prefix: '[cloudflared]',
    })

    function cleanupCloudflaredProcess() {
        if (cleaningUpCloudflaredProcess) {
            return
        }

        cleaningUpCloudflaredProcess = true
        cloudflaredProcess?.kill()
        cloudflaredProcess = null

        if (fs.existsSync(cloudflaredConfig.cloudflaredConfigPath)) {
            fs.unlinkSync(cloudflaredConfig.cloudflaredConfigPath)
        }
    }

    function linkWithHerd() {
        try {
            execFileSync('herd', ['link', cloudflaredConfig.herdHost], { cwd: process.cwd(), stdio: 'pipe' })
        } catch (error) {
            resolvedConfig.logger.warn(`  ${colors.yellow('⚠')}  ${colors.bold('Herd link failed')}: ${error.message}`)
        }
    }

    function startCloudflaredProcess() {
        resolvedConfig.logger.info(`\n  ${colors.yellow(`${colors.bold('CLOUDFLARED')} ${cloudflaredVersion()}`)}  ${colors.dim('plugin')} ${colors.bold(`v${pluginVersion()}`)}`)
        resolvedConfig.logger.info('')

        if (fs.existsSync(cloudflaredConfig.cloudflaredConfigPath)) {
            resolvedConfig.logger.error(`  ${colors.red(`➜  ${colors.bold('Error:')}`)} A cloudflared process for tunnel ${colors.cyan(`${cloudflaredConfig.name}`)} is already running.`)
            resolvedConfig.logger.error(`  ${colors.red('➜')}  Stop the existing process first if you want to start a new one.`)
            return
        }

        createCloudflaredConfigFile(cloudflaredConfig)
        linkWithHerd()

        resolvedConfig.logger.info(`  ${colors.green('➜')}  ${colors.bold('Public URL')}: ${colors.cyan(`${cloudflaredConfig.cloudflaredUrl}`)}`)
        resolvedConfig.logger.info('')

        const cmd = 'cloudflared'
        const args = ['tunnel', '--config', cloudflaredConfig.cloudflaredConfigPath, 'run']

        cloudflaredProcess = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })

        cloudflaredProcess.stderr.on('data', (data) => {
            if (cleaningUpCloudflaredProcess) {
                return
            }

            const lines = data.toString().split('\n').filter(line => line.trim())

            lines.forEach(line => {
                logger[getLineLogLevel(line)](processConsoleLine(line), { timestamp: true })
            })
        })

        cloudflaredProcess.on('error', (error) => {
            if (cleaningUpCloudflaredProcess) {
                return
            }

            logger.error('Failed to start cloudflared process:', error.message)
        })
    }

    return {
        name: 'cloudflared',
        apply(config, { command, mode }) {
            return command === 'serve' && loadEnv(mode, process.cwd(), '').CLOUDFLARED_ENABLED === 'true'
        },
        config(config, { mode }) {
            if (!cloudflaredConfig) {
                cloudflaredConfig = resolveCloudflaredConfig()
            }

            const env = loadEnv(mode, process.cwd(), '')

            cloudflaredConfig.herdUrl = env.APP_URL
            cloudflaredConfig.cloudflaredUrl = `${new URL(env.APP_URL).protocol}//${cloudflaredConfig.herdHost}`

            return {
                server: {
                    https: false,
                    cors: true,
                    hmr: {
                        protocol: "wss",
                        clientPort: 443,
                        host: cloudflaredConfig.viteHost,
                    },
                },
            }
        },
        configResolved(config) {
            resolvedConfig = config
        },
        buildEnd() {
            cleanupCloudflaredProcess()
        },
        configureServer(server) {
            server.httpServer?.once('listening', () => {
                cloudflaredConfig.viteUrl = viteServerUrl(server)
                setTimeout(() => startCloudflaredProcess(), 200)
            })

            if (!exitHandlersBound) {
                const cleanupAndExit = () => {
                    cleanupCloudflaredProcess()
                    process.exit()
                }

                process.on('exit', cleanupCloudflaredProcess)
                process.on('SIGINT', cleanupAndExit)
                process.on('SIGTERM', cleanupAndExit)
                process.on('SIGHUP', cleanupAndExit)

                exitHandlersBound = true
            }
        }
    }
}

function resolvePluginConfig(config) {
    return {
        logLevel: config.logLevel ?? 'warn',
    }
}

function resolveCloudflaredConfig() {
    const configPath = path.join(process.cwd(), '.cloudflared.yaml')

    if (!fs.existsSync(configPath)) {
        throw new Error('vite-plugin-laravel-cloudflared: missing configuration file ".cloudflared.yaml". Create a new tunnel with "php artisan cloudflared:install".')
    }

    const config = yaml.load(fs.readFileSync(configPath, 'utf8'))

    if (!config.id) {
        throw new Error('vite-plugin-laravel-cloudflared: missing "id" configuration in the ".cloudflared.yaml" file.')
    }

    if (!config.name) {
        throw new Error('vite-plugin-laravel-cloudflared: missing "name" configuration in the ".cloudflared.yaml" file.')
    }

    if (!config.hostname) {
        throw new Error('vite-plugin-laravel-cloudflared: missing "hostname" configuration in the ".cloudflared.yaml" file.')
    }

    const credentialsFilePath = path.join(os.homedir(), '.cloudflared', `${config.id}.json`)

    if (!fs.existsSync(credentialsFilePath)) {
        throw new Error(`vite-plugin-laravel-cloudflared: The credentials file for tunnel "${config.name}" does not exist. Create a new tunnel by running "php artisan cloudflared:install".`)
    }

    return {
        'id': config.id,
        'name': config.name,
        'herdHost': config.hostname,
        'herdUrl': null,
        'viteHost': `vite-${config.hostname}`,
        'viteUrl': null,
        'cloudflaredUrl': null,
        'credentialsFilePath': credentialsFilePath,
        'cloudflaredConfigPath': path.join(os.homedir(), '.cloudflared', `${config.id}.yaml`),
    }
}

function createCloudflaredConfigFile(config) {
    const cloudflaredConfigContents = `tunnel: ${config.id}
credentials-file: ${config.credentialsFilePath}

ingress:
  - hostname: ${config.viteHost}
    service: ${config.viteUrl}
  - hostname: ${config.herdHost}
    service: ${config.herdUrl}
  - service: http_status:404
`
    fs.writeFileSync(config.cloudflaredConfigPath, cloudflaredConfigContents)
}

function cloudflaredVersion() {
    try {
        return execFileSync('cloudflared', ['--version'], { encoding: 'utf8' }).match(/cloudflared version (.*?) \(built/)[1]
    } catch {
        return ''
    }
}

function pluginVersion() {
    try {
        return JSON.parse(fs.readFileSync(path.join(dirname(), '../package.json')).toString())?.version
    } catch {
        return ''
    }
}

function dirname() {
    return fileURLToPath(new URL('.', import.meta.url))
}

function viteServerUrl(server) {
    const address = server.httpServer.address()
    const host = address.address === '::' ? '127.0.0.1' : address.address
    const port = address.port
    const protocol = server.config.server?.https ? 'https' : 'http'

    return `${protocol}://${host}:${port}`
}

function stripLineLogLevel(line) {
    return line.replace(/^.*?\b(?:INF|WRN|ERR)\s+/, '')
}

function addLineColor(line) {
    return line.replace(/(error="[^"]*")|(\b\w+=)/g, (match, error, key) => {
        return error ? colors.red(error) : colors.blue(key)
    })
}

function getLineLogLevel(line) {
    if (line.includes(' ERR ')) return 'error'
    if (line.includes(' WRN ')) return 'warn'
    return 'info'
}

function processConsoleLine(line) {
    return stripLineLogLevel(addLineColor(line))
}
