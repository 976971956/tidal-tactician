import { expect, test } from 'vitest'
import { applyPlacement, demoState, moveBetween, replaceCell, wechatSample } from '../src/game/model'
import { legalMoves } from '../src/game/search'

test('完整棋盘与手动添加不推进回合', () => {
  const state = demoState()
  const edited = replaceCell(state, 0, [{ kind: 'zombie', hp: 3, initialHp: 20, variant: 'normal' }])
  expect([edited.enemies.length, edited.field.length, edited.bench.length]).toEqual([30, 10, 2])
  expect([edited.turn, edited.score, edited.drinks, edited.enemies[0][0].hp]).toEqual([0, 0, 12, 3])
  expect(state.enemies[0]).toEqual([])
})

test('同角色同等级合成并保留目标位置', () => {
  const state = wechatSample()
  const move = moveBetween(state, { zone: 'field', index: 5 }, { zone: 'field', index: 0 })!
  expect(move.kind).toBe('merge')
  const merged = applyPlacement(state, move)
  expect([merged.field[5], merged.field[0]]).toEqual([null, { role: 'li', level: 2 }])
})

test('微信默认规则只允许从休息区上阵到空格', () => {
  const state = wechatSample()
  const reserve = { zone: 'bench', index: 1 } as const
  expect(moveBetween(state, reserve, { zone: 'field', index: 2 })?.kind).toBe('move')
  expect(moveBetween(state, reserve, { zone: 'field', index: 0 })).toBeNull()
  expect(moveBetween(state, reserve, { zone: 'field', index: 1 })).toBeNull()
  expect(moveBetween(state, { zone: 'field', index: 0 }, reserve)).toBeNull()
  expect(legalMoves(state).every(move => move.to.zone === 'field')).toBe(true)
})

test('第十级攻击力 512 时不能继续合成', () => {
  const state = wechatSample()
  state.field[0] = state.field[5] = { role: 'li', level: 512 }
  expect(moveBetween(state, { zone: 'field', index: 5 }, { zone: 'field', index: 0 })).toBeNull()
})

test('不同等级伙伴交换位置', () => {
  const state = demoState()
  const move = moveBetween(state, { zone: 'field', index: 5 }, { zone: 'field', index: 6 })!
  expect(move.kind).toBe('swap')
  expect(applyPlacement(state, move).field.slice(5, 7).map(partner => partner?.level)).toEqual([1, 8])
})
