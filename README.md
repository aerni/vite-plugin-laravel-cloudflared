# Cloudflared for Vite

This Vite plugin is the companion plugin for [Cloudflared for Laravel](https://github.com/aerni/laravel-cloudflared). It allows access of your development server via your Cloudflare tunnel with full HMR support.

## Requirements

This plugin only works together with [Cloudflared for Laravel](https://github.com/aerni/laravel-cloudflared). Make sure to install that package first.

## Installation

```bash
npm install @aerni/vite-plugin-laravel-cloudflared
```

## Basic Usage

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

To run the Cloudlfare tunnel together with your Vite dev server, you have two options. You can either create a new script as follows. Now, if you run `npm run tunnel`, it will start the Vite dev server and open the Cloudflare tunnel.

```json
"scripts": {
    "build": "vite build",
    "dev": "vite",
    "tunnel": "CLOUDFLARED_ENABLED=true vite"
},
```

Or you can also add the env variable in your `.env` file. This will open the tunnel whenever you run the Vite dev server.

```env
CLOUDFLARED_ENABLED=true
```

## Advanced Configuration

You may specify the desired `logLevel`, which determines the console output of the Cloudflare tunnel.

```javascript
import { defineConfig } from 'vite'
import cloudflared from '@aerni/vite-plugin-laravel-cloudflared'

export default defineConfig({
  plugins: [
    cloudflared({ logLevel: 'info' })
  ]
})
```

## License

This package is open-sourced software licensed under the [MIT license](LICENSE.md).

## Credits

Developed by [Michael Aerni](https://michaelaerni.ch)

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/aerni/laravel-cloudflared/issues) page.
