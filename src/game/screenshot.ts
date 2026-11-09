import { COLS, ENEMY_ROWS, FIELD_SIZE, LEVELS, emptyState } from './model'
import type { Partner, State } from './model'
import { parseBoard } from './storage'

export const ocrPath = '/__tidal/ocr'
export const canRecognizeScreenshots = import.meta.env.VITE_STATIC_HOST !== '1'

export type OcrToken = { text: string; x: number; y: number; width: number; height: number }
export type OcrResult = { width: number; height: number; tokens: OcrToken[] }
export const screenshotResources = { drinks: '饮料', score: '积分', fire: '火焰符', ice: '冰冻符' } as const
type Resource = keyof typeof screenshotResources
export type ScreenshotDraft = {
  enemies: string
  field: string
  bench: string
  resources: Record<Resource, string>
}

const rows = (cells: string[], columns: number) =>
  Array.from({ length: cells.length / columns }, (_, row) =>
    cells.slice(row * columns, (row + 1) * columns).join(' ')).join('\n')

// Pixel positions use the WeChat board with a 598 × 1148 game window.
// The two labels locate the board independently of screenshot margins and scale.
export function readScreenshot(result: OcrResult, image: ImageData): ScreenshotDraft {
  const scoreLabel = result.tokens.find(token => token.text.includes('本局积分'))
  const benchLabel = result.tokens.find(token => token.text.includes('休息区'))
  if (!scoreLabel || !benchLabel) {
    throw new Error('没找到「本局积分」或「休息区」。请截取完整的走江踏浪对局画面，关闭玩法说明后重试。')
  }
  const scale = (benchLabel.y - scoreLabel.y) / (987 - 134)
  const left = benchLabel.x - 298 * scale
  const top = scoreLabel.y - 134 * scale
  if (scale <= 0 || Math.abs((scoreLabel.x - left) / scale - 251) > 30 ||
      left + 70 * scale < 0 || left + 530 * scale > result.width ||
      top + 160 * scale < 0 || top + 1115 * scale > result.height) {
    throw new Error('游戏棋盘或底部符咒区域没有截全，请重新截图。')
  }

  const tokens = result.tokens.map(token => ({
    ...token, x: (token.x - left) / scale, y: (token.y - top) / scale,
  }))
  const digits = tokens.filter(token => /^\d+$/.test(token.text))
  const counts = tokens.filter(token => /^\d+(?:[/／]\d+)?$/.test(token.text))
  function readNear(x: number, y: number, dx: number, dy: number, list = digits) {
    const nearby = list.filter(token => Math.abs(token.x - x) <= dx && Math.abs(token.y - y) <= dy)
    nearby.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
    return nearby[0]?.text ?? ''
  }

  function colorShare(x: number, y: number, width: number, height: number, test: (r: number, g: number, b: number) => boolean) {
    let matches = 0
    let samples = 0
    for (let offsetY = 0; offsetY < height; offsetY += 2) {
      for (let offsetX = 0; offsetX < width; offsetX += 2) {
        const px = Math.round(left + (x + offsetX) * scale)
        const py = Math.round(top + (y + offsetY) * scale)
        if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue
        const start = (py * image.width + px) * 4
        if (test(image.data[start], image.data[start + 1], image.data[start + 2])) matches++
        samples++
      }
    }
    return matches / Math.max(1, samples)
  }
  const purple = (r: number, g: number, b: number) => r > g + 16 && b > g + 22 && b > 65
  const orange = (r: number, g: number, b: number) => r > 150 && r > g + 27 && g > b + 24
  const warm = (r: number, g: number, b: number) => r > 110 && r > g + 22 && r > b + 35
  const teal = (r: number, g: number, b: number) => g > 158 && g > r + 44 && g > b + 14
  const blueHair = (r: number, g: number, b: number) => b > 75 && b > r + 14 && b > g + 10 && r < 120

  const enemies = Array<string>(ENEMY_ROWS * COLS).fill('.')
  const covered = new Set<number>()
  for (const token of digits) {
    const row = Math.round((token.y - 233) / 89)
    if (row < 0 || row >= ENEMY_ROWS || Math.abs(token.y - (233 + row * 89)) > 20) continue
    const column = (token.x - 124) / 94
    if (column < -0.33 || column > 4.33 || Number(token.text) < 1 || token.text.length > 4) continue
    const fraction = column - Math.floor(column)
    const large = column >= 0 && column < COLS - 1 && fraction > 0.32 && fraction < 0.68
    const index = row * COLS + (large ? Math.floor(column) : Math.round(column))
    const value = large ? 'L' + token.text : token.text
    enemies[index] = enemies[index] === '.' || enemies[index] === value ? value : '?'
    if (large) {
      covered.add(index + 1)
      if (row > 0) {
        covered.add(index - COLS)
        covered.add(index - COLS + 1)
      }
    }
  }
  for (let index = 0; index < enemies.length; index++) {
    if (enemies[index] !== '.' || covered.has(index)) continue
    const x = 115 + (index % COLS) * 94
    const y = 206 + Math.floor(index / COLS) * 89
    if (colorShare(x - 27, y + 19, 54, 15, teal) > 0.035) {
      enemies[index] = '?'
    } else if (colorShare(x - 35, y - 29, 70, 58, warm) > 0.09) {
      enemies[index] = colorShare(x - 35, y - 29, 70, 58, purple) > 0.035 ? 'B' : 'R'
    }
  }

  const field = Array.from({ length: FIELD_SIZE }, (_, index) => {
    const x = 115 + (index % COLS) * 94
    const y = 802 + Math.floor(index / COLS) * 89
    const level = readNear(x + 9, y, 32, 19)
    const li = colorShare(x - 40, y - 12, 25, 22, orange)
    const qin = colorShare(x - 40, y - 12, 25, 22, purple)
    const role = qin > 0.04 && qin > li * 0.8 ? '秦' : li > 0.05 ? '李' : '?'
    if (!level && colorShare(x - 25, y - 67, 49, 40, blueHair) < 0.12) return '.'
    return role + (LEVELS.some(value => value === Number(level)) ? level : '?')
  })
  const bench = Array.from({ length: 3 }, (_, index) => {
    const x = 185 + index * 111
    if (tokens.some(token => /解锁|购买|战令/.test(token.text) && Math.abs(token.x - x) < 47 &&
        token.y >= 1005 && token.y <= 1100)) return null
    const level = readNear(x + 31, 1019, 24, 16)
    const portrait = colorShare(x - 34, 1031, 69, 67, blueHair) >= 0.15
    if (!level && !portrait) return '.'
    const role = colorShare(x + 8, 1033, 33, 52, orange) > 0.035 ? '李' : '?'
    return role + (LEVELS.some(value => value === Number(level)) ? level : '?')
  }).filter((slot): slot is string => slot !== null)

  return {
    enemies: rows(enemies, COLS), field: rows(field, COLS), bench: bench.join(' '),
    resources: {
      drinks: readNear(82, 134, 40, 20),
      score: readNear(370, 134, 58, 20),
      fire: readNear(543, 1034, 31, 22, counts).split(/[/／]/)[0],
      ice: readNear(543, 1120, 31, 22, counts).split(/[/／]/)[0],
    },
  }
}

export function screenshotState(draft: ScreenshotDraft, state: State): State {
  function partners(text: string, label: string): (Partner | null)[] {
    return text.trim().split(/\s+/).filter(Boolean).map(token => {
      if (token === '.') return null
      const match = /^([李秦])(\d+)$/.exec(token)
      const level = Number(match?.[2])
      if (!match || !LEVELS.some(value => value === level)) {
        throw new Error(`${label}的「${token}」需要核对。请填李或秦加上攻击力，例如李8、秦2，空格填点号。`)
      }
      return { role: match[1] === '李' ? 'li' : 'qin', level }
    })
  }
  const field = partners(draft.field, '上阵区')
  const bench = partners(draft.bench, '休息区')
  if (field.length !== FIELD_SIZE) throw new Error('上阵区需要 10 格，按从上到下、从左到右填写。')
  if (bench.length > 24) throw new Error('休息区最多填写 24 格。')
  const next = emptyState({ ...state.rules, benchCapacity: bench.length })
  const resources = Object.keys(screenshotResources) as Resource[]
  for (const key of resources) {
    const value = draft.resources[key]
    if (!/^\d{1,9}$/.test(value.trim())) throw new Error(`请核对${screenshotResources[key]}数量，填入非负整数。`)
    next[key] = Number(value)
  }
  return { ...next, field, bench, enemies: parseBoard(draft.enemies, next.rules) }
}
