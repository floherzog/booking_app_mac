import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@core': resolve(process.cwd(), 'src/core') },
  },
  test: {
    environment: 'node',
    include: ['src/core/__tests__/**/*.test.js'],
  },
})
