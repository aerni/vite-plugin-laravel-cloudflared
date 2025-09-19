import { loadEnv, createLogger } from 'vite'
import { spawn, execFileSync } from 'child_process'
import colors from 'picocolors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Vite plugin for integrating Cloudflare Tunnel with your development server
 * @param {string|Object} config - Configuration options or host string
 * @param {string} config.host - The Cloudflare tunnel host
 * @param {string} config.logLevel - Log level (default: 'warn')
 * @returns {Object} Vite plugin object
 */
export default function cloudflared(config = {}) {
    const pluginConfig = resolvePluginConfig(config)

    let resolvedConfig
    let cloudflaredProcess
    let exitHandlersBound = false
    let cleaningUpCloudflaredProcess = false

    const logger = createLogger(pluginConfig.logLevel, {
        prefix: '[cloudflared]',
    })

    function cleanupCloudflaredProcess() {
        cleaningUpCloudflaredProcess = true
        cloudflaredProcess?.kill()
        cloudflaredProcess = null
    }

    function startCloudflaredProcess() {
        const clientPort = resolvedConfig.server.hmr.clientPort
        const hmrHost = resolvedConfig.server.hmr.host
        const schema = resolvedConfig.server.https ? 'https' : 'http'

        resolvedConfig.logger.info(`\n  ${colors.yellow(`${colors.bold('CLOUDFLARED')} ${cloudflaredVersion()}`)}  ${colors.dim('plugin')} ${colors.bold(`v${pluginVersion()}`)}`)
        resolvedConfig.logger.info('')
        resolvedConfig.logger.info(`  ${colors.green('➜')}  ${colors.bold('Host')}: ${colors.cyan(`${schema}://${hmrHost}:${colors.bold(clientPort)}`)}`)
        resolvedConfig.logger.info('')

        const cmd = 'cloudflared'
        const args = ['tunnel', 'run']

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

            logger.error('Failed to start Cloudflare Tunnel:', error.message)
        })
    }

    return {
        name: 'cloudflared',
        apply(config, { command, mode }) {
            return command === 'serve' && loadEnv(mode, process.cwd(), '').CLOUDFLARED_ENABLED === 'true'
        },
        config(config, { mode }) {
            const hmrHost = pluginConfig.host || loadEnv(mode, process.cwd(), '').CLOUDFLARED_HOST

            if (!hmrHost) {
                throw new Error('cloudflared-vite-plugin: missing configuration for "host"')
            }

            return {
                server: {
                    https: false,
                    cors: true,
                    hmr: {
                        protocol: "wss",
                        clientPort: 443,
                        host: hmrHost,
                    }
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
        host: config.host,
        logLevel: config.logLevel ?? 'warn',
    };

    if (typeof config === 'string') {
        defaultConfig = { ...defaultConfig, host: config };
    }

    return defaultConfig;
}

function cloudflaredVersion() {
    try {
        return execFileSync('cloudflared', ['--version'], { encoding: 'utf8' }).match(/cloudflared version (.*?) \(built/)[1];
    } catch {
        return '';
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
