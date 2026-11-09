import { expect, test } from 'vitest'
import { simulate } from '../src/game/combat'
import { demoState, emptyState, wechatSample } from '../src/game/model'
import type { State } from '../src/game/model'
import { recommend } from '../src/game/search'

function add(state: State, index: number, hp: number) {
  state.enemies[index] = [{ kind: 'zombie', hp, initialHp: hp, variant: 'normal' }]
}

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
