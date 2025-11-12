# Cloudflared for Vite

This Vite plugin is the companion to [Cloudflared for Laravel](https://github.com/aerni/laravel-cloudflared). It allows access to your development server via your Cloudflare tunnel with full HMR support.

## Requirements

This plugin requires [Cloudflared for Laravel](https://github.com/aerni/laravel-cloudflared). Install that package first.

## Installation

```bash
npm install @aerni/vite-plugin-laravel-cloudflared
```

## Usage

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

Enable the Cloudflare tunnel by setting the `CLOUDFLARED_ENABLED` environment variable. You can either add it to your `.env` file:

```env
CLOUDFLARED_ENABLED=true
```

Or create an npm script in `package.json`:

```json
"scripts": {
  "dev": "vite",
  "tunnel": "CLOUDFLARED_ENABLED=true vite"
}
```

## Configuration

Configure the plugin's `logLevel` to control console output from the Cloudflare tunnel:

```javascript
cloudflared({ logLevel: 'info' })
```

## License

Licensed under the [MIT license](LICENSE.md).

## Credits

Developed by [Michael Aerni](https://michaelaerni.ch).
