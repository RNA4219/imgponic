import { fileURLToPath } from 'node:url'

import { defineConfig, type PluginOption } from 'vite'

const reactLite = (): PluginOption => ({
  name: 'vite:react-lite',
  config: () => ({
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react'
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']
    }
  })
})

const indexHtmlEntry = fileURLToPath(new URL('./public/index.html', import.meta.url))

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  plugins: [reactLite()],
  define: {
    'import.meta.vitest': 'undefined'
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: indexHtmlEntry
    }
  }
})
