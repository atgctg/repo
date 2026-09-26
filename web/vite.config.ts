import path from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import babel from '@rolldown/plugin-babel'
import stylex from '@stylexjs/unplugin'
import { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      shared: path.resolve(import.meta.dirname, '../shared/index.ts'),
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    stylex.vite({
      aliases: {
        '~/*': [path.resolve(import.meta.dirname, 'app/*')],
      },
      useCSSLayers: { before: ['reset'] },
      devPersistToDisk: true,
      unstable_moduleResolution: {
        type: 'commonJS',
        rootDir: path.resolve(import.meta.dirname),
      },
    }),
    reactRouter(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})
