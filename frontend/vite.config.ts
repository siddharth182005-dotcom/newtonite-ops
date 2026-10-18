/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev proxy keeps the browser same-origin with the API, so the SameSite=Lax session cookie just works.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: false } } },
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'], globals: true, exclude: [...configDefaults.exclude, '.tsupgrader/**'] },
})
