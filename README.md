# Cloudflared for Vite

A companion Vite plugin for [Cloudflared for Laravel](https://github.com/aerni/laravel-cloudflared) that seamlessly integrates Vite's dev server with your Cloudflare Tunnel. This plugin runs the tunnel and ensures your Vite assets load correctly with full Hot Module Replacement support, making it effortless to test and debug your frontend on any device.

## Prerequisites

This plugin requires [Cloudflared for Laravel](https://github.com/aerni/laravel-cloudflared) as its foundation. Install and configure that package first.

## Installation

Install the package using npm:

```bash
npm install @aerni/vite-plugin-laravel-cloudflared
```

Add the plugin to your `vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import cloudflared from '@aerni/vite-plugin-laravel-cloudflared'

export default defineConfig({
  plugins: [
    cloudflared()
  ]
})
```

You can optionally configure the `logLevel` to output more information from the Cloudflare tunnel. Available options are `'info'`, `'warn'` (default), and `'error'`:

```javascript
cloudflared({ logLevel: 'info' })
```

## Basic Usage

> **Note:** The tunnel only runs when the Vite dev server is running, not during builds.

### Using an npm script (recommended)

Create an npm script in `package.json` to open the tunnel on demand with a simple command:

```json
"scripts": {
  "tunnel": "CLOUDFLARED_ENABLED=true vite"
}
```

Run `npm run tunnel` to start Vite and open the Cloudflare tunnel.

### Using an environment variable

Alternatively, use an environment variable in your `.env` file to always open the Cloudflare tunnel when the Vite dev server is started:

```env
CLOUDFLARED_ENABLED=true
```

## License

This package is open-sourced software licensed under the [MIT license](LICENSE.md).

## Credits

Developed by [Michael Aerni](https://michaelaerni.ch)

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/aerni/vite-plugin-laravel-cloudflared/issues) page.
