# vite-plugin-laravel-cloudflared

A Vite plugin for integrating Cloudflare Tunnel with your development server, enabling secure HTTPS tunneling during development with Hot Module Replacement (HMR) support.

## Features

- 🚀 Seamless integration with Vite development server
- 🔒 Secure HTTPS tunneling via Cloudflare Tunnel
- ⚡ Hot Module Replacement (HMR) support over WebSocket Secure (WSS)
- 🎨 Colored console output for tunnel status
- 🔧 Configurable cloudflared command and logging
- 🛡️ Automatic process cleanup on exit

## Installation

```bash
npm install vite-plugin-laravel-cloudflared
# or
yarn add vite-plugin-laravel-cloudflared
# or
pnpm add vite-plugin-laravel-cloudflared
```

## Prerequisites

You need to have `cloudflared` installed and configured on your system. Follow the [Cloudflare Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/) to set up your tunnel.

## Usage

### Basic Configuration

Add the plugin to your `vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import cloudflared from 'vite-plugin-laravel-cloudflared'

export default defineConfig({
  plugins: [
    cloudflared('your-tunnel-host.trycloudflare.com')
  ]
})
```

### Advanced Configuration

```javascript
import { defineConfig } from 'vite'
import cloudflared from 'vite-plugin-laravel-cloudflared'

export default defineConfig({
  plugins: [
    cloudflared({
      host: 'your-tunnel-host.trycloudflare.com',
      command: 'cloudflared tunnel run',
      logLevel: 'info'
    })
  ]
})
```

### Environment Variables

The plugin can also read configuration from environment variables:

- `CLOUDFLARED_ENABLED`: Set to `'true'` to enable the plugin
- `CLOUDFLARED_VITE_HMR_HOST`: The tunnel host (alternative to config.host)

Example `.env` file:
```
CLOUDFLARED_ENABLED=true
CLOUDFLARED_VITE_HMR_HOST=your-tunnel-host.trycloudflare.com
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | `string` | - | **Required.** Your Cloudflare tunnel host |
| `command` | `string` | `'cloudflared tunnel run'` | The cloudflared command to execute |
| `logLevel` | `string` | `'warn'` | Log level for plugin output (`'error'`, `'warn'`, `'info'`, `'silent'`) |

## How It Works

1. The plugin only activates when:
   - Running `vite` (not `vite build`)
   - `CLOUDFLARED_ENABLED=true` environment variable is set

2. When activated, it:
   - Configures Vite's HMR to use WSS protocol over port 443
   - Starts the cloudflared process when the dev server begins listening
   - Captures and formats cloudflared output with colored logging
   - Automatically cleans up the cloudflared process on exit

3. The result is a development server accessible via your Cloudflare tunnel with full HMR support.

## Example Setup

1. Set up your Cloudflare tunnel:
```bash
cloudflared tunnel create my-dev-tunnel
cloudflared tunnel route dns my-dev-tunnel my-app.example.com
```

2. Configure your `cloudflared.yml`:
```yaml
tunnel: my-dev-tunnel
credentials-file: /path/to/credentials.json
ingress:
  - hostname: my-app.example.com
    service: http://localhost:5173
  - service: http_status:404
```

3. Add to your `vite.config.js`:
```javascript
import cloudflared from 'vite-plugin-laravel-cloudflared'

export default defineConfig({
  plugins: [
    cloudflared('my-app.example.com')
  ]
})
```

4. Set environment variable and start development:
```bash
export CLOUDFLARED_ENABLED=true
npm run dev
```

## License

MIT

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.