import { expect, test } from 'vitest'
import { simulate } from '../src/game/combat'
import { emptyState, occupiedCells } from '../src/game/model'
import type { Partner, State, Zombie } from '../src/game/model'
import { encodeBoard, parseBoard } from '../src/game/storage'

const zombie = (hp: number, initialHp = hp): Zombie => ({ kind: 'zombie', variant: 'normal', hp, initialHp })
const deploy = { kind: 'move', from: { zone: 'bench', index: 0 }, to: { zone: 'field', index: 0 } } as const
function board(partner: Partner = { role: 'li', level: 1 }): State {
  const state = emptyState()
  state.bench[0] = partner
  return state
}

test('末排僵尸击杀后安全，按初始血量计分', () => {
  const state = board()
  state.enemies[25] = [zombie(1, 20)]
  const result = simulate(state, deploy)!
  expect(result.state).toMatchObject({ failed: false, score: 30, drinks: 11, turn: 1 })
  expect(result.state.enemies[25]).toEqual([])
})

test('第 5 排移至第 6 排仍安全，下一次越线失败', () => {
  const state = board()
  state.enemies[21] = [zombie(3)]
  const result = simulate(state, deploy)!
  expect(result.state.failed).toBe(false)
  expect(result.state.enemies[26]).toEqual([zombie(3)])
  const second = simulate(result.state, { kind: 'move', from: deploy.to, to: { zone: 'field', index: 5 } })!
  expect(second.state.failed).toBe(true)
})

test('秦璃对整列僵尸造成伤害，秘卷不受伤并正常前进', () => {
  const state = board({ role: 'qin', level: 2 })
  state.enemies[0] = [zombie(4)]
  state.enemies[5] = [{ kind: 'book', hp: 1 }]
  state.enemies[10] = [zombie(5)]
  const result = simulate(state, deploy)!
  expect(result.hits.map(hit => hit.after)).toEqual([3, 2])
  expect(result.state.enemies[5]).toEqual([zombie(2, 4)])
  expect(result.state.enemies[10]).toEqual([{ kind: 'book', hp: 1 }])
  expect(result.loot).toBe(0)
})

test('单张符纸优先攻击最低僵尸，伤害不溢出', () => {
  const state = board({ role: 'li', level: 8 })
  state.rules.li[8] = { total: 8, shots: 1, shotDamage: 8, retarget: false }
  state.enemies[0] = [zombie(2)]
  state.enemies[15] = [zombie(1)]
  const result = simulate(state, deploy)!
  expect(result.hits.map(hit => hit.index)).toEqual([15])
  expect(result.state.enemies[5]).toEqual([zombie(2)])
})

test('复演微信交换实测，已知邪祟的血量和密卷位移与图三相同', () => {
  const state = emptyState()
  state.enemies = parseBoard([
    '. . . 40 .',
    '32 B . . .',
    '. . . 34 .',
    '. . . . 11',
    'L13 . . 5 .',
    '. 2 . . .',
  ].join('\n'), state.rules)
  state.field = [
    { role: 'qin', level: 8 }, { role: 'li', level: 2 }, null, { role: 'li', level: 8 }, { role: 'li', level: 2 },
    { role: 'li', level: 2 }, { role: 'qin', level: 1 }, null, { role: 'qin', level: 2 }, { role: 'li', level: 8 },
  ]
  const result = simulate(state, { kind: 'swap', from: { zone: 'field', index: 0 }, to: { zone: 'field', index: 8 } })!
  expect(result.state.failed).toBe(false)
  expect(result.killed).toBe(2)
  // The game also refreshed a new 40-HP enemy and scroll on row 1 after this move.
  expect(encodeBoard(result.state)).toBe([
    '. . . . .',
    '. . . 32/40 .',
    '30/32 B1 . . .',
    '. . . 18/34 .',
    '. . . . 1/11',
    'L7/13 . . . .',
  ].join('\n'))
})

test('道具随邪祟前进，出底线消失且不会判负', () => {
  const state = board()
  state.enemies[1] = [{ kind: 'book', hp: 1 }]
  state.enemies[26] = [{ kind: 'bottle', hp: 1 }]
  const result = simulate(state, deploy)!
  expect(result.state.failed).toBe(false)
  expect(result.state.enemies[6]).toEqual([{ kind: 'book', hp: 1 }])
  expect(result.state.enemies[26]).toEqual([])
})

test('规则允许多符纸击杀后转移目标，每张伤害独立', () => {
  const state = board({ role: 'li', level: 8 })
  state.rules.li[8] = { total: 8, shots: 2, shotDamage: 4, retarget: true }
  state.enemies[0] = [zombie(6)]
  state.enemies[15] = [zombie(1)]
  expect(simulate(state, deploy)!.hits.map(hit => hit.damage)).toEqual([1, 4])
})

test('李追远打碎秘卷后，生成伙伴填入休息区', () => {
  const state = board()
  state.enemies[0] = [{ kind: 'book', hp: 1 }]
  const result = simulate(state, deploy)!
  expect(result.state.bench[0]).toEqual({ role: 'li', level: 1 })
  expect(result.state.enemies[0]).toEqual([])
})

test('休息区满时丢失血瓷瓶生成的秦璃', () => {
  const state = board()
  state.bench.fill({ role: 'li', level: 1 })
  state.field[5] = { role: 'li', level: 1 }
  state.enemies[0] = [{ kind: 'bottle', hp: 1 }]
  const result = simulate(state, { kind: 'move', from: { zone: 'field', index: 5 }, to: deploy.to })!
  expect(result).toMatchObject({ loot: 0, lost: 1 })
  expect(result.notes[0]).toContain('丢失')
})

test('合成消费一瓶饮料并获得 10 分，目标格升级', () => {
  const state = board()
  state.field[0] = state.field[1] = state.bench[0]
  const result = simulate(state, { kind: 'merge', from: deploy.to, to: { zone: 'field', index: 1 } })!
  expect(result.state).toMatchObject({ turn: 1, drinks: 11, score: 10 })
  expect(result.state.field.slice(0, 2)).toEqual([null, { role: 'li', level: 2 }])
})

test('同列跨排移动后仍攻击该列', () => {
  const state = board()
  state.field[5] = { role: 'li', level: 1 }
  state.enemies[15] = [zombie(2)]
  expect(simulate(state, { kind: 'move', from: { zone: 'field', index: 5 }, to: deploy.to })!.hits[0].index).toBe(15)
})

test('火焰符保留同列道具，计击杀分，不消耗饮料或回合', () => {
  const state = board()
  state.enemies[25] = [zombie(2, 18), { kind: 'book', hp: 1 }]
  const result = simulate(state, { kind: 'fire', col: 0 })!
  expect(result.state).toMatchObject({ turn: 0, drinks: 12, score: 18, fire: 0 })
  expect(result.state.enemies[25]).toEqual([{ kind: 'book', hp: 1 }])
})

test('冰冻保留攻击，阻止下一次正常回合推进，随后解除', () => {
  const state = board()
  state.enemies[25] = [zombie(3)]
  const frozen = simulate(state, { kind: 'ice' })!.state
  expect(frozen).toMatchObject({ turn: 0, score: 0, drinks: 12, ice: 0, frozen: 1 })
  const result = simulate(frozen, deploy)!
  expect(result.state).toMatchObject({ failed: false, frozen: 0 })
  expect(result.state.enemies[25]).toEqual([zombie(2, 3)])
})

test('大型邪祟两列共用一条血量，闪电各列只结算一次', () => {
  const state = board({ role: 'qin', level: 2 })
  state.field[0] = { role: 'qin', level: 4 }
  state.enemies[20] = [{ ...zombie(10, 16), variant: 'large' }]
  const result = simulate(state, { ...deploy, to: { zone: 'field', index: 1 } })!
  expect(result.hits.map(hit => hit.after)).toEqual([6, 4])
  expect(result.state.enemies[25]).toEqual([{ ...zombie(4, 16), variant: 'large' }])
  const fire = simulate(result.state, { kind: 'fire', col: 1 })!
  expect(fire.killed).toBe(1)
  expect(fire.state.score).toBe(26)
  expect(fire.state.enemies[25]).toEqual([])
})

test('第一排的大型邪祟前进一步后，四格全部进入棋盘', () => {
  const state = board()
  state.rules.collision = 'hold'
  const large: Zombie = { ...zombie(13), variant: 'large' }
  state.enemies[0] = [large]
  state.enemies[5] = [zombie(9)]
  expect(occupiedCells(0, large)).toEqual([0, 1])

  const result = simulate(state, { ...deploy, to: { zone: 'field', index: 4 } })!
  expect(result.state.enemies[0]).toEqual([])
  expect(result.state.enemies[5]).toEqual([large])
  expect(occupiedCells(5, large)).toEqual([5, 6, 0, 1])
  expect(result.state.enemies[10]).toEqual([zombie(9)])
})
