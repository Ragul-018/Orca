import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Vite injects an inline React Refresh preamble during development. Keep the
 * shipped CSP strict, but allow that one inline script while the dev server is
 * running.
 */
function developmentCsp(): Plugin {
  return {
    name: 'orca-development-csp',
    transformIndexHtml(html, context) {
      if (!context.server) return html
      return html.replace(
        "script-src 'self';",
        "script-src 'self' 'unsafe-inline';"
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), developmentCsp()]
  }
})
