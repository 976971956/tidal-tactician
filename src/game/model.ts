export const COLS = 5
export const ENEMY_ROWS = 6
export const FIELD_SIZE = 10
export const LEVELS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024] as const

export type Role = 'li' | 'qin'
export type Partner = { role: Role; level: number }
export type Zombie = { kind: 'zombie'; hp: number; initialHp: number; variant: 'normal' | 'special' | 'large' }
export type Prop = { kind: 'book' | 'bottle'; hp: number }
export type Enemy = Zombie | Prop
export type Zone = 'field' | 'bench'
export type Slot = { zone: Zone; index: number }
export type Move = { kind: 'move' | 'swap' | 'merge'; from: Slot; to: Slot }
export type Action = Move | { kind: 'fire'; col: number } | { kind: 'ice' }

export type LiAttack = { total: number; shots: number; shotDamage: number; retarget: boolean }
export type Rules = {
  li: Record<number, LiAttack>
  qin: Record<number, number>
  attackOrder: 'front' | 'back' | 'li' | 'qin'
  propTarget: 'after-zombies' | 'lowest' | 'disabled'
  propTiming: 'immediate' | 'after-attacks'
  propMovement: 'with-enemies' | 'every-turn' | 'stationary'
  bookHp: number
  bottleHp: number
  benchCapacity: number
  freezeTurns: number
  boundary: number
  blockWithPartner: boolean
  collision: 'stack' | 'hold'
  maxLevel: number
  mergeScope: 'all' | 'same-zone' | 'field'
  allowReturn: boolean
}

export type State = {
  enemies: Enemy[][]
  field: (Partner | null)[]
  bench: (Partner | null)[]
  drinks: number
  score: number
  fire: number
  ice: number
  frozen: number
  turn: number
  failed: boolean
  rules: Rules
}

export const names = { li: '李追远', qin: '秦璃', book: '追远密卷', bottle: '血瓷瓶' }
export const rowOf = (index: number) => Math.floor(index / COLS)
export const colOf = (index: number) => index % COLS
export const isLarge = (enemy: Enemy) => enemy.kind === 'zombie' && enemy.variant === 'large'
export const largeAnchorFits = (index: number) => index >= 0 && index < ENEMY_ROWS * COLS && colOf(index) < COLS - 1
export const sameSlot = (a: Slot | null, b: Slot) => a?.zone === b.zone && a.index === b.index
export const slotKey = (slot: Slot) => `${slot.zone}:${slot.index}`

export function enemyColumns(index: number, enemy: Enemy) {
  const col = colOf(index)
  return isLarge(enemy) ? [col, col + 1] : [col]
}

// Large units use their bottom-left cell. The upper half can be above the board.
export function occupiedCells(index: number, enemy: Enemy) {
  if (!isLarge(enemy)) return [index]
  return index < COLS ? [index, index + 1] : [index, index + 1, index - COLS, index - COLS + 1]
}

export function defaultRules(): Rules {
  return {
    li: Object.fromEntries(LEVELS.map(level => {
      const shots = level >= 8 ? 4 : level >= 2 ? 2 : 1
      return [level, { total: level, shots, shotDamage: level / shots, retarget: shots > 1 }]
    })),
    qin: Object.fromEntries(LEVELS.map(level => [level, level])),
    attackOrder: 'qin', propTarget: 'lowest', propTiming: 'after-attacks', propMovement: 'with-enemies',
    bookHp: 1, bottleHp: 1, benchCapacity: 2, freezeTurns: 1, boundary: 6,
    blockWithPartner: false, collision: 'stack', maxLevel: 512, mergeScope: 'field', allowReturn: false,
  }
}

export function emptyState(rules = defaultRules()): State {
  return {
    enemies: Array.from({ length: ENEMY_ROWS * COLS }, () => []),
    field: Array(FIELD_SIZE).fill(null),
    bench: Array(rules.benchCapacity).fill(null),
    drinks: 12, score: 0, fire: 1, ice: 1, frozen: 0, turn: 0, failed: false, rules,
  }
}

export function demoState(): State {
  const state = emptyState()
  const enemies = [[0, 2, 7], [1, 0, 4], [2, 3, 10], [3, 2, 6], [4, 3, 14], [5, 1, 5]]
  for (const [row, col, hp] of enemies) {
    state.enemies[row * COLS + col] = [{ kind: 'zombie', hp, initialHp: hp, variant: hp >= 10 ? 'special' : 'normal' }]
  }
  state.enemies[1] = [{ kind: 'book', hp: 1 }]
  state.enemies[14] = [{ kind: 'bottle', hp: 1 }]
  state.field[0] = { role: 'qin', level: 2 }
  state.field[3] = { role: 'li', level: 8 }
  state.field[5] = { role: 'li', level: 8 }
  state.field[6] = { role: 'li', level: 1 }
  state.field[8] = { role: 'qin', level: 4 }
  state.bench[0] = { role: 'li', level: 2 }
  state.bench[1] = { role: 'qin', level: 1 }
  return state
}

export function wechatSample(): State {
  const state = emptyState()
  // The screenshot provides current health; initial health can be corrected in the editor.
  const monsters = [[2, 44], [6, 37], [13, 39], [18, 33], [21, 33], [27, 71]]
  for (const [index, hp] of monsters) {
    state.enemies[index] = [{ kind: 'zombie', hp, initialHp: hp, variant: index === 27 ? 'large' : 'normal' }]
  }
  state.enemies[8] = [{ kind: 'bottle', hp: 1 }]
  state.enemies[16] = [{ kind: 'book', hp: 1 }]
  state.field = [
    { role: 'li', level: 1 }, { role: 'li', level: 16 }, null, { role: 'qin', level: 2 }, null,
    { role: 'li', level: 1 }, { role: 'qin', level: 8 }, null, { role: 'qin', level: 1 }, { role: 'li', level: 8 },
  ]
  state.bench = [{ role: 'qin', level: 1 }, { role: 'li', level: 1 }]
  return { ...state, drinks: 83, score: 4535, fire: 0 }
}

export function enemyName(enemy: Enemy) {
  return enemy.kind === 'zombie' ? { normal: '普通僵尸', special: '特殊僵尸', large: '大型邪祟' }[enemy.variant] : names[enemy.kind]
}

export function slotName(slot: Slot) {
  return slot.zone === 'bench' ? `休息区第 ${slot.index + 1} 格` : `伙伴区 ${rowOf(slot.index) + 1} 排 ${colOf(slot.index) + 1} 列`
}

export function moveBetween(state: State, from: Slot, to: Slot): Move | null {
  const source = state[from.zone][from.index]
  const target = state[to.zone][to.index]
  if (!source || target === undefined || sameSlot(from, to)) return null
  const matching = target?.role === source.role && target.level === source.level
  const scope = state.rules.mergeScope
  const canMerge = scope === 'all' || (scope === 'same-zone' && from.zone === to.zone) ||
    (scope === 'field' && from.zone === 'field' && to.zone === 'field')
  if (matching && canMerge && source.level < state.rules.maxLevel) return { kind: 'merge', from, to }
  if (from.zone === 'bench' && to.zone === 'bench') return null
  if (from.zone !== to.zone && !state.rules.allowReturn && (from.zone === 'field' || target)) return null
  if (matching) return null
  return { kind: target ? 'swap' : 'move', from, to }
}

export function applyPlacement(state: State, action: Move): State {
  const next = { ...state, field: [...state.field], bench: [...state.bench] }
  const source = next[action.from.zone][action.from.index]!
  const target = next[action.to.zone][action.to.index]
  next[action.to.zone][action.to.index] = action.kind === 'merge' ? { ...source, level: source.level * 2 } : source
  next[action.from.zone][action.from.index] = action.kind === 'swap' ? target : null
  return next
}

export function describe(state: State, action: Action) {
  if (action.kind === 'fire') return `对第 ${action.col + 1} 列使用火焰符`
  if (action.kind === 'ice') return '使用冰冻符冻结全场'
  const source = state[action.from.zone][action.from.index]!
  const who = `${names[source.role]}（攻击力 ${source.level}）`
  if (action.kind === 'merge') return `合成 ${who}，保留在${slotName(action.to)}`
  if (action.kind === 'swap') return `交换${slotName(action.from)}与${slotName(action.to)}的伙伴`
  return `将${who}从${slotName(action.from)}移到${slotName(action.to)}`
}

export function replaceCell(state: State, index: number, enemies: Enemy[]): State {
  const cells = [...state.enemies]
  cells[index] = enemies
  return { ...state, enemies: cells, failed: false }
}
