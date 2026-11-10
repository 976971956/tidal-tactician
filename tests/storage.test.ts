import { expect, test } from 'vitest'
import { commit, historyOf, redo, undo } from '../src/game/history'
import { demoState, emptyState, wechatSample } from '../src/game/model'
import { encodeBoard, exportState, importState, parseBoard } from '../src/game/storage'
import { simulate } from '../src/game/combat'

test('撤销和重做恢复完整状态及资源', () => {
  const state = demoState()
  const ice = simulate(state, { kind: 'ice' })!.state
  const fire = simulate(ice, { kind: 'fire', col: 3 })!.state
  const after = simulate(fire, { kind: 'swap', from: { zone: 'field', index: 5 }, to: { zone: 'field', index: 6 } })!.state
  const history = commit(commit(commit(historyOf(state), ice), fire), after)
  expect(undo(history).present).toEqual(fire)
  expect(undo(undo(undo(history))).present).toEqual(state)
  expect(redo(undo(history)).present).toEqual(after)
})

test('大型邪祟只在左下格存储，批量导入拒绝超界占格', () => {
  const state = wechatSample()
  expect(encodeBoard(state).split('\n')[5]).toBe('. . L71 . .')
  expect(parseBoard(encodeBoard(state), state.rules)).toEqual(state.enemies)
  expect(importState(exportState(state))).toEqual(state)
  const board = encodeBoard(state)
  state.enemies = parseBoard(board.replace('. . 44 . .', 'L19 . 44 . .'), state.rules)
  expect(state.enemies[0]).toEqual([{ kind: 'zombie', variant: 'large', hp: 19, initialHp: 19 }])
  expect(importState(exportState(state))).toEqual(state)
  expect(() => parseBoard(board.replace('. . 44 . .', '. . 44 . L71'), state.rules)).toThrow('无法容纳')
})

test('保留 30 次完整历史，编辑后清除重做分支', () => {
  let history = historyOf(emptyState())
  for (let score = 1; score < 40; score++) history = commit(history, { ...history.present, score })
  expect(history.past).toHaveLength(30)
  expect(commit(undo(history), emptyState()).future).toEqual([])
})

test('存档与批量棋盘双向转换，拒绝坏输入', () => {
  const state = demoState()
  expect(importState(exportState(state))).toEqual(state)
  expect(parseBoard(encodeBoard(state), state.rules)).toEqual(state.enemies)
  expect(() => importState('{"version":1,"state":{}}')).toThrow()
  expect(() => parseBoard('. .', state.rules)).toThrow()
})

test('旧存档更新旧版默认规则，保留已有的自定义伤害', () => {
  const state = demoState()
  const old = JSON.parse(exportState(state))
  delete old.state.rules.propMovement
  delete old.state.rules.maxFireUses
  delete old.state.rules.maxIceUses
  old.state.rules.attackOrder = 'front'
  old.state.rules.li[2] = { total: 2, shots: 1, shotDamage: 2, retarget: false }
  old.state.rules.li[8] = { total: 6, shots: 3, shotDamage: 2, retarget: true }
  const loaded = importState(JSON.stringify(old))
  expect(loaded.rules).toMatchObject({
    attackOrder: 'qin', propMovement: 'with-enemies',
    maxFireUses: null, maxIceUses: null,
    li: { 2: { shots: 2, shotDamage: 1, retarget: true }, 8: old.state.rules.li[8] },
  })
  expect(loaded.enemies).toEqual(state.enemies)
})

test('存档保留两个符咒上限，包括禁止使用的零值', () => {
  const state = emptyState()
  state.rules.maxFireUses = 2
  state.rules.maxIceUses = 0
  expect(importState(exportState(state)).rules).toMatchObject({ maxFireUses: 2, maxIceUses: 0 })
  state.rules.maxIceUses = -1
  expect(() => importState(exportState(state))).toThrow('冰冻符使用上限')
})
