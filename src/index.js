import { loadEnv, createLogger } from 'vite'
import { spawn, execFileSync } from 'child_process'
import colors from 'picocolors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

/**
 * Vite plugin for integrating Cloudflare Tunnel with your development server
 * @param {string|Object} config - Configuration options or tunnel string
 * @param {string} config.tunnel - The Cloudflare tunnel ID
 * @param {string} config.logLevel - Log level (default: 'warn')
 * @returns {Object} Vite plugin object
 */
export default function cloudflared(config = {}) {
    const pluginConfig = resolvePluginConfig(config)

    let resolvedConfig
    let cloudflaredConfigPath
    let cloudflaredProcess
    let cleaningUpCloudflaredProcess = false
    let exitHandlersBound = false

    const logger = createLogger(pluginConfig.logLevel, {
        prefix: '[cloudflared]',
    })

    function createCloudflaredConfig() {
        const config = `tunnel: ${resolvedConfig.tunnel}
credentials-file: ${path.join(os.homedir(), '.cloudflared', `${resolvedConfig.tunnel}.json`)}

ingress:
  - hostname: ${resolvedConfig.cloudflaredViteHost}
    service: ${resolvedConfig.viteUrl}
  - hostname: ${resolvedConfig.cloudflaredAppHost}
    service: ${resolvedConfig.appUrl}
  - service: http_status:404
`

        const cloudflaredConfigPath = path.join(os.tmpdir(), `cloudflared-${resolvedConfig.tunnel}.yaml`)

        fs.writeFileSync(cloudflaredConfigPath, config)

        return cloudflaredConfigPath
    }

    function cleanupCloudflaredProcess() {
        if (cleaningUpCloudflaredProcess) {
            return
        }

        cleaningUpCloudflaredProcess = true
        cloudflaredProcess?.kill()
        cloudflaredProcess = null

        if (cloudflaredConfigPath && fs.existsSync(cloudflaredConfigPath)) {
            fs.unlinkSync(cloudflaredConfigPath)
            cloudflaredConfigPath = null
        }

    }

    function cloudflaredProcessExists() {
        const configPath = path.join(os.tmpdir(), `cloudflared-${resolvedConfig.tunnel}.yaml`)
        return fs.existsSync(configPath)
    }

    function startCloudflaredProcess() {
        resolvedConfig.logger.info(`\n  ${colors.yellow(`${colors.bold('CLOUDFLARED')} ${cloudflaredVersion()}`)}  ${colors.dim('plugin')} ${colors.bold(`v${pluginVersion()}`)}`)
        resolvedConfig.logger.info('')

        if (cloudflaredProcessExists()) {
            resolvedConfig.logger.error(`  ${colors.red(`➜  ${colors.bold('Error:')}`)} A cloudflared process for tunnel ${colors.cyan(`${resolvedConfig.tunnel}`)} is already running.`)
            resolvedConfig.logger.error(`  ${colors.red('➜')}  Stop the existing process first if you want to start a new one.`)
            return
        }

        resolvedConfig.logger.info(`  ${colors.green('➜')}  ${colors.bold('Public URL')}: ${colors.cyan(`${resolvedConfig.cloudflaredAppUrl}`)}`)
        resolvedConfig.logger.info('')

        cloudflaredConfigPath = createCloudflaredConfig()

        const cmd = 'cloudflared'
        const args = ['tunnel', '--config', cloudflaredConfigPath, 'run']

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
            const env = loadEnv(mode, process.cwd(), '')
            config.tunnel = pluginConfig.tunnel || env.CLOUDFLARED_TUNNEL
            config.cloudflaredAppUrl = env.CLOUDFLARED_APP_URL
            config.cloudflaredAppHost = new URL(env.CLOUDFLARED_APP_URL).hostname
            config.cloudflaredViteHost = `vite-${config.cloudflaredAppHost}`
            config.viteUrl = 'http://127.0.0.1:5173'
            config.appUrl = env.APP_URL

            if (!config.tunnel) {
                throw new Error('cloudflared-vite-plugin: missing configuration for "tunnel"')
            }

            if (!config.cloudflaredAppUrl) {
                throw new Error('cloudflared-vite-plugin: make sure to set CLOUDFLARE_APP_URL')
            }

            return {
                server: {
                    https: false,
                    cors: true,
                    hmr: {
                        protocol: "wss",
                        clientPort: 443,
                        host: config.cloudflaredViteHost,
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
    let defaultConfig = {
        tunnel: config.tunnel,
        logLevel: config.logLevel ?? 'warn',
    }

    if (typeof config === 'string') {
        defaultConfig = { ...defaultConfig, tunnel: config }
    }

    return defaultConfig
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
