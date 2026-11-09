import { defaultRules, emptyState, ENEMY_ROWS, COLS, FIELD_SIZE, largeAnchorFits, LEVELS, names } from './model'
import type { Enemy, Partner, Rules, State } from './model'
import { historyOf } from './history'
import type { History } from './history'

export const LIVE_KEY = 'tidal-tactician/live-v1'
export const SAVE_KEY = 'tidal-tactician/save-v1'
const MAX_COUNT = 1_000_000_000

function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`${label}格式有误`)
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

function readRules(value: unknown): Rules {
  check(object(value), '规则')
  const result = defaultRules()
  const data = value
  const legacy = value.propMovement === undefined
  for (const key of ['bookHp', 'bottleHp', 'benchCapacity', 'freezeTurns', 'boundary', 'maxLevel'] as const) {
    const max = { bookHp: 9999, bottleHp: 9999, benchCapacity: 24, freezeTurns: 12, boundary: 6, maxLevel: 1024 }[key]
    const amount = value[key]
    check(integer(amount, key === 'benchCapacity' ? 0 : 1, max), key)
    result[key] = amount
  }
  check(LEVELS.some(level => level === result.maxLevel), '合成等级上限')
  for (const key of ['blockWithPartner', 'allowReturn'] as const) {
    const enabled = value[key]
    check(typeof enabled === 'boolean', key)
    result[key] = enabled
  }
  function option<T extends string>(key: string, values: readonly T[]): T {
    const matched = values.find(item => item === data[key])
    check(matched, key)
    return matched
  }
  result.attackOrder = option('attackOrder', ['front', 'back', 'li', 'qin'])
  // Older saves stored the original defaults alongside any user adjustments.
  if (legacy && result.attackOrder === 'front') result.attackOrder = 'qin'
  result.propTarget = option('propTarget', ['after-zombies', 'lowest', 'disabled'])
  result.propTiming = option('propTiming', ['immediate', 'after-attacks'])
  if (!legacy) result.propMovement = option('propMovement', ['with-enemies', 'every-turn', 'stationary'])
  result.collision = option('collision', ['stack', 'hold'])
  result.mergeScope = option('mergeScope', ['all', 'same-zone', 'field'])
  check(object(value.li) && object(value.qin), '角色伤害')
  for (const level of LEVELS) {
    const li = value.li[level]
    const qin = value.qin[level]
    check(object(li) && integer(li.total, 0, 9999) && integer(li.shots, 1, 64) &&
      integer(li.shotDamage, 0, 9999) && typeof li.retarget === 'boolean', `李追远 ${level} 级`)
    check(integer(qin, 0, 9999), `秦璃 ${level} 级`)
    const oldDefault = legacy && li.total === level && li.shots === 1 && li.shotDamage === level && !li.retarget
    if (!oldDefault) result.li[level] = { total: li.total, shots: li.shots, shotDamage: li.shotDamage, retarget: li.retarget }
    result.qin[level] = qin
  }
  return result
}

export function validateState(value: unknown): State {
  check(object(value), '棋盘')
  const rules = readRules(value.rules)
  function readPartners(data: unknown, capacity: number): (Partner | null)[] {
    check(Array.isArray(data) && data.length === capacity, '伙伴区容量')
    return data.map(partner => {
      if (partner === null) return null
      check(object(partner) && (partner.role === 'li' || partner.role === 'qin') &&
        LEVELS.some(level => level === partner.level), '伙伴')
      return { role: partner.role, level: partner.level as number }
    })
  }
  check(Array.isArray(value.enemies) && value.enemies.length === ENEMY_ROWS * COLS, '僵尸区容量')
  const enemies = value.enemies.map((cell, index): Enemy[] => {
    check(Array.isArray(cell), '僵尸格')
    return cell.map(enemy => {
      check(object(enemy) && integer(enemy.hp, 1, 9999), '敌方血量')
      if (enemy.kind === 'book' || enemy.kind === 'bottle') return { kind: enemy.kind, hp: enemy.hp }
      check(enemy.kind === 'zombie' && integer(enemy.initialHp, enemy.hp, 9999) &&
        (enemy.variant === 'normal' || enemy.variant === 'special' ||
          (enemy.variant === 'large' && largeAnchorFits(index))), '僵尸')
      return { kind: 'zombie', hp: enemy.hp, initialHp: enemy.initialHp, variant: enemy.variant }
    })
  })
  const { drinks, score, fire, ice, frozen, turn, failed } = value
  check(integer(drinks, 0, MAX_COUNT) && integer(score, 0, Number.MAX_SAFE_INTEGER) &&
    integer(fire, 0, MAX_COUNT) && integer(ice, 0, MAX_COUNT) &&
    integer(frozen, 0, 12) && integer(turn, 0, Number.MAX_SAFE_INTEGER) && typeof failed === 'boolean', '回合资源')
  return { enemies, field: readPartners(value.field, FIELD_SIZE), bench: readPartners(value.bench, rules.benchCapacity),
    drinks, score, fire, ice, frozen, turn, failed, rules }
}

export function readHistory(): History<State> {
  try {
    const raw = localStorage.getItem(LIVE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return { past: data.past.slice(-30).map(validateState), present: validateState(data.present), future: data.future.slice(0, 30).map(validateState) }
    }
  } catch {
    // A corrupted autosave must never prevent the editor from starting.
  }
  return historyOf(emptyState())
}

export function exportState(state: State) {
  return JSON.stringify({ version: 1, state }, null, 2)
}

export function importState(raw: string) {
  const data: unknown = JSON.parse(raw)
  check(object(data) && data.version === 1, '存档版本')
  return validateState(data.state)
}

export function encodeBoard(state: State) {
  const prefix = { normal: '', special: 'S', large: 'L' }
  return Array.from({ length: ENEMY_ROWS }, (_, row) => state.enemies.slice(row * COLS, (row + 1) * COLS).map(cell =>
    cell.map(enemy => enemy.kind === 'zombie'
      ? `${prefix[enemy.variant]}${enemy.hp}${enemy.hp === enemy.initialHp ? '' : '/' + enemy.initialHp}`
      : `${enemy.kind === 'book' ? 'B' : 'R'}${enemy.hp}`).join('+') || '.').join(' ')).join('\n')
}

export function parseBoard(raw: string, rules: Rules): Enemy[][] {
  const rows = raw.trim().split(/\r?\n/)
  if (rows.length !== ENEMY_ROWS) throw new Error('请输入 6 行，每行 5 格。')
  return rows.flatMap((row, index) => {
    const cells = row.trim().split(/\s+/)
    if (cells.length !== COLS) throw new Error(`第 ${index + 1} 行需要 5 格。`)
    return cells.map((cell, col): Enemy[] => {
      if (cell === '.') return []
      const items = cell.toUpperCase().split('+')
      if (items.length > 64) throw new Error(`第 ${index + 1} 行第 ${col + 1} 列同格单位过多。`)
      return items.map(item => {
        const match = /^([SLBR]?)(\d{0,4})(?:\/(\d{1,4}))?$/.exec(item)
        const error = () => new Error(`第 ${index + 1} 行第 ${col + 1} 列的「${item}」格式有误。`)
        if (!match) throw error()
        const [, kind, amount, initial] = match
        if (kind === 'B' || kind === 'R') {
          const hp = amount ? Number(amount) : kind === 'B' ? rules.bookHp : rules.bottleHp
          if (!hp || initial) throw error()
          return { kind: kind === 'B' ? 'book' : 'bottle', hp }
        }
        const hp = Number(amount)
        const initialHp = initial ? Number(initial) : hp
        if (!hp || initialHp < hp) throw error()
        if (kind === 'L' && !largeAnchorFits(index * COLS + col)) {
          throw new Error(`第 ${index + 1} 排第 ${col + 1} 列无法容纳大型邪祟。请在占地左下角（第 1–4 列）录入。`)
        }
        const variant = kind === 'L' ? 'large' : kind === 'S' ? 'special' : 'normal'
        return { kind: 'zombie', hp, initialHp, variant }
      })
    })
  })
}

export function asText(state: State) {
  const partners = (list: State['field']) => list.map(partner => partner ? names[partner.role] + partner.level : '空').join('、')
  const { rules } = state
  return `走江踏浪局面｜回合 ${state.turn}｜饮料 ${state.drinks}｜积分 ${state.score}｜火焰符 ${state.fire}｜冰冻符 ${state.ice}｜剩余冻结回合 ${state.frozen}｜${state.failed ? '已失败' : '进行中'}
僵尸区（从上到下，S=特殊，L=大型左下格，B=追远密卷，R=血瓷瓶，当前/初始，+ 表示同格）
${encodeBoard(state)}
伙伴区前排：${partners(state.field.slice(0, 5))}
伙伴区后排：${partners(state.field.slice(5))}
休息区：${partners(state.bench)}
规则 JSON：${JSON.stringify(rules)}`
}
