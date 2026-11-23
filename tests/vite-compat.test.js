import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const cases = [
    {
        name: 'Vite 7 keeps the WebSocket settings on server.hmr',
        vitePackage: 'vite-7',
        websocketKey: 'hmr',
    },
    {
        name: 'Vite 8.0 keeps the WebSocket settings on server.hmr',
        vitePackage: 'vite-8-0',
        websocketKey: 'hmr',
    },
    {
        name: 'Vite 8.1 and newer put the WebSocket settings on server.ws',
        vitePackage: 'vite',
        websocketKey: 'ws',
    },
]

for (const entry of cases) {
    test(entry.name, () => {
        const vitePackagePath = path.join(root, 'node_modules', entry.vitePackage)
        assert.equal(fs.existsSync(vitePackagePath), true, `Install dependencies so ${entry.vitePackage} is present.`)

        const resolved = resolveWithVite(vitePackagePath)
        const websocket = resolved[entry.websocketKey]
        const otherKey = entry.websocketKey === 'ws' ? 'hmr' : 'ws'

        assert.equal(websocket.protocol, 'wss')
        assert.equal(websocket.clientPort, 443)
        assert.equal(websocket.host, 'vite-example.test')
        assert.equal(resolved.https, false)
        assert.notEqual(resolved.cors, false)

        if (entry.websocketKey === 'ws') {
            assert.equal(resolved.hmr.protocol, 'wss')
            assert.equal(resolved.hmr.clientPort, 443)
            assert.equal(resolved.hmr.host, 'vite-example.test')
            assert.equal(
                resolved.warnings.some((warning) => warning.includes('server.hmr.protocol/host/port/path/clientPort/timeout/server')),
                false,
                `Vite ${resolved.version} warned about deprecated server.hmr options:\n${resolved.warnings.join('\n')}`,
            )
        } else {
            assert.ok(
                resolved[otherKey] == null || resolved[otherKey] === false,
                `Expected server.ws to stay unset on Vite ${resolved.version}, received ${JSON.stringify(resolved.ws)}`,
            )
        }
    })
}

function resolveWithVite(vitePackagePath) {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflared-vite-'))
    const pluginDir = path.join(app, 'node_modules/@aerni/vite-plugin-laravel-cloudflared')

    fs.mkdirSync(path.join(pluginDir, 'src'), { recursive: true })
    fs.copyFileSync(path.join(root, 'src/index.js'), path.join(pluginDir, 'src/index.js'))
    fs.copyFileSync(path.join(root, 'package.json'), path.join(pluginDir, 'package.json'))
    link(vitePackagePath, path.join(app, 'node_modules/vite'))
    link(path.join(root, 'node_modules/picocolors'), path.join(app, 'node_modules/picocolors'))
    link(path.join(root, 'node_modules/js-yaml'), path.join(app, 'node_modules/js-yaml'))

    const home = path.join(app, 'home')
    fs.mkdirSync(path.join(home, '.cloudflared'), { recursive: true })
    fs.writeFileSync(path.join(home, '.cloudflared/tunnel-id.json'), '{}')
    fs.writeFileSync(path.join(app, '.cloudflared.yaml'), [
        'id: tunnel-id',
        'name: test',
        'hostname: example.test',
        'vite: true',
        '',
    ].join('\n'))

    const pluginEntry = path.join(pluginDir, 'src/index.js')
    fs.writeFileSync(path.join(app, 'run.mjs'), `
import { pathToFileURL } from 'node:url'

const warnings = []
console.warn = (...args) => {
    warnings.push(args.map(String).join(' '))
}

const { default: cloudflared } = await import(pathToFileURL(${JSON.stringify(pluginEntry)}).href)
const { resolveConfig, version } = await import('vite')
const resolved = await resolveConfig({
    configFile: false,
    plugins: [cloudflared()],
    logLevel: 'silent',
}, 'serve')
const hmr = pickWebsocket(resolved.server.hmr)
const ws = pickWebsocket(resolved.server.ws)

process.stdout.write(JSON.stringify({
    version,
    hmr,
    ws,
    https: resolved.server.https ?? null,
    cors: resolved.server.cors ?? null,
    warnings,
}))

function pickWebsocket(value) {
    if (!value || typeof value !== 'object') {
        return value ?? null
    }

    return {
        protocol: value.protocol ?? null,
        clientPort: value.clientPort ?? null,
        host: value.host ?? null,
    }
}
`)

    const result = spawnSync(process.execPath, ['run.mjs'], {
        cwd: app,
        env: {
            ...process.env,
            HOME: home,
            CLOUDFLARED_ENABLED: 'true',
        },
        encoding: 'utf8',
    })

    fs.rmSync(app, { recursive: true, force: true })

    assert.equal(result.status, 0, `Vite config resolution failed.\n${result.stdout}\n${result.stderr}`)

    return JSON.parse(result.stdout)
}

function link(target, linkPath) {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true })
    fs.symlinkSync(target, linkPath)
}
