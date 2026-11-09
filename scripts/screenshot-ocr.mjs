import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const maxBytes = 12 * 1024 * 1024
const endpoint = '/__tidal/ocr'

export function screenshotOcr() {
  let busy = false

  function mount({ config, middlewares }, host) {
    if (process.platform !== 'darwin' || host !== '127.0.0.1') return
    const script = resolve(config.root, 'scripts/screenshot-ocr.swift')
    const cache = resolve(config.root, 'node_modules/.cache/tidal-ocr')

    middlewares.use(async (request, response, next) => {
      if (request.url !== endpoint) return next()
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      function reply(status, payload) {
        response.statusCode = status
        response.end(JSON.stringify(payload))
      }

      if (request.method === 'GET') return reply(200, { available: true })
      if (request.method !== 'POST' || request.headers.origin !== `http://${request.headers.host}` ||
          !/^127\.0\.0\.1:\d+$/.test(request.headers.host ?? '') ||
          request.headers['content-type'] !== 'image/png') {
        return reply(403, { error: '截图识别仅接受本机推演器页面发送的图片。' })
      }
      if (Number(request.headers['content-length']) > maxBytes) {
        return reply(413, { error: '截图太大，请裁剪到游戏窗口。' })
      }
      if (busy) return reply(429, { error: '正在识别另一张截图，请稍后重试。' })

      busy = true
      try {
        const chunks = []
        let total = 0
        for await (const chunk of request) {
          total += chunk.length
          if (total > maxBytes) {
            reply(413, { error: '截图太大，请裁剪到游戏窗口。' })
            return
          }
          chunks.push(chunk)
        }
        await mkdir(cache, { recursive: true })
        const output = await new Promise((accept, reject) => {
          const child = execFile('/usr/bin/swift', ['-module-cache-path', cache, script],
            { timeout: 50_000, maxBuffer: 1024 * 1024 }, (error, stdout) => error ? reject(error) : accept(stdout))
          child.stdin.on('error', () => {})
          child.stdin.end(Buffer.concat(chunks, total))
        })
        reply(200, JSON.parse(output))
      } catch (error) {
        // Avoid logging the subprocess arguments or any OCR output.
        console.error('本机截图识别失败', error?.code ?? error?.name)
        reply(422, { error: 'Mac 无法识别这张截图。请重试 PNG 截图，或检查本机 Swift 工具是否可用。' })
      } finally {
        busy = false
      }
    })
  }

  return {
    name: 'tidal-screenshot-ocr',
    configureServer(server) { mount(server, server.config.server.host) },
    configurePreviewServer(server) { mount(server, server.config.preview.host) },
  }
}
