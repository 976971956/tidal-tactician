import { expect, test } from 'vitest'
import { simulate } from '../src/game/combat'
import { demoState, emptyState, wechatSample } from '../src/game/model'
import type { State } from '../src/game/model'
import { recommend } from '../src/game/search'
import { parseBoard } from '../src/game/storage'

function add(state: State, index: number, hp: number) {
  state.enemies[index] = [{ kind: 'zombie', hp, initialHp: hp, variant: 'normal' }]
}

test('同样无需符咒时，优先上阵到能立即清场的列', () => {
  const state = emptyState()
  state.fire = state.ice = 0
  state.bench[0] = { role: 'li', level: 1 }
  add(state, 4, 1)

  const result = recommend(state)
  expect(result).toMatchObject({
    action: { kind: 'move', from: { zone: 'bench', index: 0 }, to: { zone: 'field', index: 4 } },
    status: 'clear', survived: 1, rescue: false,
  })
  expect(result.path).toHaveLength(1)
  expect(simulate(state, result.action!)).toMatchObject({ killed: 1, state: { drinks: state.drinks - 1 } })
})

test('没有符咒但仍能守住时，沿用常规推演排序', () => {
  const state = emptyState()
  state.drinks = 1
  state.fire = state.ice = 0
  state.bench[0] = { role: 'qin', level: 2 }
  state.enemies[0] = [{ kind: 'zombie', hp: 2, initialHp: 20, variant: 'normal' }]
  add(state, 1, 6)
  add(state, 6, 6)
  add(state, 11, 6)

  const result = recommend(state)
  expect(result).toMatchObject({ status: 'limited', action: { to: { zone: 'field', index: 1 } } })
  expect(simulate(state, result.action!)).toMatchObject({ killed: 0, state: { score: 10, failed: false } })
})

test('无符且所有走法都会失守时，推荐得分最高的最后一步', () => {
  const state = emptyState()
  state.fire = state.ice = 0
  state.drinks = 1
  state.bench[0] = { role: 'qin', level: 2 }
  state.enemies[0] = [{ kind: 'zombie', hp: 2, initialHp: 20, variant: 'normal' }]
  add(state, 26, 2)
  add(state, 27, 30)

  const last = recommend(state)
  expect(last).toMatchObject({
    status: 'final-score', survived: 0, rescue: false,
    action: { kind: 'move', to: { zone: 'field', index: 0 } },
  })
  expect(last.path).toEqual([last.action])
  expect(simulate(state, last.action!)).toMatchObject({ killed: 1, state: { score: 30, failed: true } })

  state.enemies[27] = []
  const defense = recommend(state)
  expect(defense).toMatchObject({ status: 'limited', survived: 1, action: { to: { zone: 'field', index: 1 } } })
  expect(simulate(state, defense.action!)).toMatchObject({ killed: 1, state: { score: 12, failed: false } })
})

test('合成和上阵都能立即清场时，优先合成', () => {
  const state = emptyState()
  state.field[0] = state.field[1] = { role: 'qin', level: 2 }
  state.bench[0] = { role: 'li', level: 1 }
  add(state, 25, 1)

  const result = recommend(state)
  expect(result).toMatchObject({
    action: { kind: 'merge', to: { zone: 'field', index: 0 } },
    status: 'clear', survived: 1, rescue: false,
  })
  expect(simulate(state, result.action!)?.state.field[0]?.level).toBe(4)
})

test('能安全清场时，先救即将越过底线的血瓷瓶', () => {
  const state = emptyState()
  state.enemies = parseBoard([
    '. 4 . R .', '. . 4 . .', '1 . . . .', '. . . . .', '. . . . .', '. R . . .',
  ].join('\n'), state.rules)
  state.field[0] = { role: 'qin', level: 2 }
  state.field[2] = state.field[4] = { role: 'li', level: 1 }
  state.field[6] = { role: 'qin', level: 1 }

  const result = recommend(state)
  expect(result).toMatchObject({ status: 'clear', survived: 3, rescue: false })
  const first = simulate(state, result.action!)!
  expect(first).toMatchObject({ expiringLoot: 1, state: { bench: [{ role: 'qin', level: 1 }, null] } })
  expect(first.hits).toContainEqual(expect.objectContaining({ index: 26, killed: true }))
  let cursor = state
  for (const action of result.path) {
    cursor = simulate(cursor, action)!.state
    expect(cursor.failed).toBe(false)
  }
  expect(cursor.enemies.flat().every(enemy => enemy.kind !== 'zombie')).toBe(true)

  state.rules.propMovement = 'stationary'
  expect(recommend(state)).toMatchObject({ survived: 2, action: { kind: 'merge' } })

  state.rules.propMovement = 'with-enemies'
  add(state, 27, 2)
  const defense = recommend(state)
  expect(defense.action).toMatchObject({ kind: 'merge', to: { zone: 'field', index: 2 } })
  expect(simulate(state, defense.action!)?.state.failed).toBe(false)
})

test('安全的合成目标有多个时，优先打出更多实际伤害的合成', () => {
  const state = emptyState()
  state.drinks = 1
  state.field[0] = state.field[1] = { role: 'qin', level: 2 }
  add(state, 15, 5)
  add(state, 1, 10)
  add(state, 6, 10)
  add(state, 11, 10)

  const result = recommend(state)
  expect(result.action).toMatchObject({ kind: 'merge', to: { zone: 'field', index: 1 } })
  const outcome = simulate(state, result.action!)!
  expect(outcome.state.failed).toBe(false)
  expect(outcome.hits.reduce((damage, hit) => damage + hit.damage, 0)).toBe(12)
})

test('推荐安全操作，避开会让末排僵尸逃逸的走法', () => {
  const state = demoState()
  const result = recommend(state, 4)
  expect(['move', 'swap', 'merge']).toContain(result.action?.kind)
  expect(result.rescue).toBe(false)
  expect(['clear', 'safe']).toContain(result.status)
  let cursor = state
  for (const action of result.path) {
    cursor = simulate(cursor, action)!.state
    expect(cursor.failed).toBe(false)
  }
  expect(cursor.enemies.flat().filter(enemy => enemy.kind === 'zombie').length).toBe(0)
})

test('普通操作无法救场时才推荐符咒', () => {
  const state = emptyState()
  state.bench[0] = { role: 'li', level: 1 }
  add(state, 27, 30)
  const result = recommend(state, 3)
  expect(result.action).toEqual({ kind: 'fire', col: 2 })
  expect(result.rescue).toBe(true)
})

test('火焰符受库存和整条推荐路线的使用上限约束', () => {
  const state = emptyState()
  state.bench[0] = { role: 'li', level: 1 }
  state.ice = 0
  state.fire = 3
  add(state, 25, 30)
  add(state, 27, 30)

  state.rules.maxFireUses = 1
  expect(recommend(state).status).toBe('impossible')
  state.rules.maxFireUses = 2
  expect(recommend(state)).toMatchObject({
    status: 'clear', path: [{ kind: 'fire', col: 0 }, { kind: 'fire', col: 2 }],
  })
  expect(state.fire).toBe(3)
  state.fire = 1
  expect(recommend(state).status).toBe('impossible')
})

test('冰冻符在不同回合的使用次数累计，设为零时跳过', () => {
  const state = emptyState()
  state.bench[0] = { role: 'li', level: 1 }
  state.fire = 0
  state.ice = 3
  add(state, 25, 3)

  state.rules.maxIceUses = 0
  expect(recommend(state)).toMatchObject({ action: { kind: 'move' }, status: 'final-score', survived: 0 })
  state.rules.maxIceUses = 1
  expect(recommend(state)).toMatchObject({ action: { kind: 'ice' }, status: 'limited', survived: 1 })
  state.rules.maxIceUses = 2
  const result = recommend(state)
  expect(result.status).toBe('clear')
  expect(result.path.filter(action => action.kind === 'ice')).toHaveLength(2)
})

test('当前安全但后续无解的移动不会压过无符咒清场路线', () => {
  const state = emptyState()
  state.field[0] = { role: 'li', level: 8 }
  state.field[4] = { role: 'qin', level: 4 }
  state.bench[0] = { role: 'li', level: 4 }
  add(state, 26, 5)
  add(state, 24, 15)
  const result = recommend(state, 4)
  expect(result.rescue).toBe(false)
  expect(result.status).toBe('clear')
  let cursor = state
  for (const action of result.path) {
    cursor = simulate(cursor, action)!.state
    expect(cursor.failed).toBe(false)
  }
})

test('没有伙伴操作时说明推演停滞', () => {
  const state = emptyState()
  add(state, 25, 4)
  expect(recommend(state, 3)).toMatchObject({ status: 'stalled', action: null })
})

test('清场后能立即领取道具时，可推荐正常操作领取伙伴', () => {
  const state = emptyState()
  state.bench[0] = { role: 'li', level: 1 }
  state.enemies[2] = [{ kind: 'book', hp: 1 }]
  const result = recommend(state)
  expect(result.action?.kind).toBe('move')
  expect(simulate(state, result.action!)?.loot).toBe(1)
})

test('多种操作都能拿到同一个道具时，优先让休息区伙伴上阵', () => {
  const state = emptyState()
  state.field[0] = { role: 'li', level: 1 }
  state.bench[0] = { role: 'qin', level: 1 }
  state.enemies[0] = [{ kind: 'book', hp: 1 }]

  const result = recommend(state)
  expect(result.action).toMatchObject({ kind: 'move', from: { zone: 'bench' }, to: { zone: 'field' } })
  expect(simulate(state, result.action!)?.loot).toBe(1)
})

test('常规走法能安全结算最后一瓶饮料时，停步同步资源而不为凑深度用符', () => {
  const state = emptyState()
  state.drinks = 1
  state.bench[0] = { role: 'li', level: 1 }
  add(state, 0, 4)
  const result = recommend(state, 3)
  expect(result).toMatchObject({ status: 'limited', survived: 1, rescue: false })
  expect(result.action?.kind).toBe('move')
})

test('微信实局只能用冰冻延迟一回合，不能给出持续安全解', () => {
  const result = recommend(wechatSample())
  expect(result).toMatchObject({ action: { kind: 'ice' }, survived: 1, status: 'limited', rescue: true })
})
