import { defineConfig } from 'vite'
import { screenshotOcr } from './scripts/screenshot-ocr.mjs'

export default defineConfig({
  base: './',
  plugins: [screenshotOcr()],
  build: { target: ['safari16', 'chrome105', 'firefox105'] },
})
