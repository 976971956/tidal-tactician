import { simulate } from './combat'
import { colOf, enemyColumns, moveBetween, rowOf, slotKey } from './model'
import type { Action, Move, Partner, Slot, State } from './model'

type Node = { state: State; path: Action[]; spells: number; value: number[]; motion: number; loot: number }
export type Recommendation = {
  action: Action | null; path: Action[]; depth: number; survived: number; searched: number
  status: 'clear' | 'safe' | 'limited' | 'stalled' | 'impossible' | 'final-score'
  pruned: boolean; normalPruned: boolean; rescue: boolean
}

export const zombiesOn = (state: State) => state.enemies.flatMap((cell, index) =>
  cell.flatMap(enemy => enemy.kind === 'zombie' ? [{ index, enemy }] : []))

export function legalMoves(state: State) {
  if (!state.drinks || state.failed) return []
  const slots: Slot[] = [
    ...state.field.map((_, index) => ({ zone: 'field' as const, index })),
    ...state.bench.map((_, index) => ({ zone: 'bench' as const, index })),
  ]
  const moves: Move[] = []
  for (const from of slots) {
    if (!state[from.zone][from.index]) continue
    const equivalent = new Set<string>()
    for (const to of slots) {
      const move = moveBetween(state, from, to)
      if (!move) continue
      if (move.kind === 'swap' && from.zone === to.zone && from.index > to.index) continue
      if (move.kind === 'merge' && from.zone === 'bench' && to.zone === 'bench' && from.index > to.index) continue
      const key = to.zone === 'bench' ? partnerKey(state.bench[to.index]) + move.kind : slotKey(to)
      if (equivalent.has(key)) continue
      equivalent.add(key)
      moves.push(move)
    }
  }
  return moves
}

const partnerKey = (partner: Partner | null) => partner ? partner.role + partner.level : '-'
const stateKey = (state: State) => [
  state.field.map(partnerKey).join(','), state.bench.map(partnerKey).sort().join(','),
  JSON.stringify(state.enemies), state.fire, state.ice, state.frozen,
].join('|')

export function risk(state: State) {
  const zombies = zombiesOn(state)
  const output = Array.from({ length: 5 }, () => 0)
  for (const [index, partner] of state.field.entries()) {
    if (!partner) continue
    const li = state.rules.li[partner.level]
    output[colOf(index)] += partner.role === 'li' ? Math.min(li.total, li.shotDamage * li.shots) : state.rules.qin[partner.level]
  }
  let pressure = 0
  let exposed = 0
  let remainingHp = 0
  for (const { index, enemy } of zombies) {
    const distance = Math.max(0, state.rules.boundary - rowOf(index) - 1) + state.frozen
    remainingHp += enemy.hp
    pressure += (enemy.hp + 2) / (distance + 1) ** 2
    const damage = enemyColumns(index, enemy).reduce((total, col) => total + output[col], 0)
    if (distance === 0 && enemy.hp > damage) exposed++
  }
  return { pressure, exposed, remainingHp, count: zombies.length, bottom: zombies.filter(({ index }) => rowOf(index) >= state.rules.boundary - 1).length, output }
}

function lineupPriority(action?: Action) {
  if (action?.kind === 'merge') return 2
  return Number(action?.kind === 'move' && action.from.zone === 'bench' && action.to.zone === 'field')
}

function rank(state: State, loot: number, motion: number, firstAction?: Action) {
  const { count, exposed, remainingHp, pressure, output } = risk(state)
  return [
    // For clear boards, save turns before comparing score, which increases with every move.
    Number(count === 0), count === 0 ? -state.turn : 0, -exposed, -remainingHp, -pressure, lineupPriority(firstAction),
    output.filter(Boolean).length,
    output.reduce((sum, amount) => sum + amount, 0), loot, state.score, -motion,
  ]
}

function compare(a: Node, b: Node) {
  const spellDifference = a.spells - b.spells
  if (spellDifference) return spellDifference
  for (let index = 0; index < a.value.length; index++) {
    const delta = b.value[index] - a.value[index]
    if (delta) return delta
  }
  // When otherwise tied, let the player keep the spell for a later turn.
  return a.path.findIndex(action => action.kind === 'fire' || action.kind === 'ice') * -1 +
    b.path.findIndex(action => action.kind === 'fire' || action.kind === 'ice')
}

function spellActions(state: State): Action[] {
  const zombies = zombiesOn(state)
  const columns = state.fire ? [...new Set(zombies.flatMap(({ index, enemy }) => enemyColumns(index, enemy)))].sort() : []
  const actions: Action[] = columns.map(col => ({ kind: 'fire', col }))
  if (state.ice && !state.frozen && state.drinks && zombies.length > 0) actions.push({ kind: 'ice' })
  return actions
}

export function recommend(initial: State, depth = 4, width = 44): Recommendation {
  const available = {
    ...initial,
    fire: Math.min(initial.fire, initial.rules.maxFireUses ?? initial.fire),
    ice: Math.min(initial.ice, initial.rules.maxIceUses ?? initial.ice),
  }
  const noSpells = available.fire === 0 && available.ice === 0
  const root: Node = { state: available, path: [], spells: 0, value: rank(available, 0, 0), motion: 0, loot: 0 }
  let searched = 0
  const requestedDepth = Math.max(3, Math.min(7, depth))
  function run(rescue: boolean) {
    const limit = searched + 90_000
    let pruned = false
    let frontier = [root]
    let longest = root
    let goal: Node | undefined
    let scoringMove: { action: Action; score: number } | undefined
    let stalled = false
    function trim(nodes: Node[]) {
      const unique = new Map<string, Node>()
      for (const node of nodes) {
        const key = stateKey(node.state)
        const old = unique.get(key)
        if (!old || compare(node, old) < 0) unique.set(key, node)
      }
      const groups = new Map<number, Node[]>()
      for (const node of unique.values()) {
        const group = groups.get(node.spells)
        if (group) group.push(node)
        else groups.set(node.spells, [node])
      }
      return [...groups.values()].flatMap(group => {
        const size = group[0].spells ? Math.min(width, 16) : width
        pruned ||= group.length > size
        return group.sort(compare).slice(0, size)
      }).sort(compare)
    }
    function step(node: Node, action: Action) {
      searched++
      const result = simulate(node.state, action, false)
      if (!result) return null
      if (result.state.failed) {
        if (noSpells && node === root && (!scoringMove || result.state.score > scoringMove.score)) {
          scoringMove = { action, score: result.state.score }
        }
        return null
      }
      const spell = action.kind === 'fire' || action.kind === 'ice'
      const motion = node.motion + (spell ? 0 :
        action.from.zone === 'field' && action.to.zone === 'field' && colOf(action.from.index) === colOf(action.to.index) ? 3 :
          action.kind === 'merge' ? 2 : 1)
      const loot = node.loot + result.loot - result.lost
      const path = [...node.path, action]
      return { state: result.state, path, spells: node.spells + Number(spell), value: rank(result.state, loot, motion, path[0]), motion, loot }
    }
    function record(node: Node) {
      const turns = node.state.turn - initial.turn
      const oldTurns = longest.state.turn - initial.turn
      if (turns > oldTurns || (turns === oldTurns && (node.path.length > 0 && !longest.path.length || compare(node, longest) < 0))) longest = node
      if (node.value[0] || turns >= requestedDepth) {
        if (!goal || compare(node, goal) < 0) goal = node
        return true
      }
      return false
    }
    for (let turn = 0; turn <= requestedDepth && frontier.length; turn++) {
      let upcoming: Node[] = []
      let layer = frontier
      // Spells are zero-turn actions. At most five occupied columns and one ice cast can
      // be used between normal turns. Keep spell layers separate so they survive beam pruning.
      for (let casts = 0; casts <= (rescue ? 6 : 0) && layer.length; casts++) {
        const spells: Node[] = []
        for (const node of layer) {
          if (record(node) || (goal && node.spells > goal.spells)) continue
          const moves = legalMoves(node.state)
          if (!moves.length) stalled = true
          for (const move of moves) {
            if (searched >= limit) { pruned = true; break }
            const child = step(node, move)
            if (child && !record(child)) upcoming.push(child)
          }
          if (upcoming.length >= 2048) upcoming = trim(upcoming)
          if (rescue && casts < 6 && searched < limit && (!goal || node.spells < goal.spells)) {
            for (const action of spellActions(node.state)) {
              const child = step(node, action)
              if (child) spells.push(child)
            }
          }
        }
        layer = trim(spells)
      }
      frontier = trim(upcoming)
    }
    return { goal, longest, pruned, stalled, scoringMove }
  }

  if (initial.failed) return { action: null, path: [], depth: requestedDepth, survived: 0, searched, status: 'impossible', pruned: false, normalPruned: false, rescue: false }
  if (root.value[0]) {
    // With no zombies on the board, recommend a prop-only move only if it
    // immediately adds a partner. Players can otherwise wait for a real spawn.
    let harvest: { action: Move; loot: number } | undefined
    if (initial.bench.includes(null) && initial.enemies.some(cell => cell.length > 0)) {
      for (const action of legalMoves(initial)) {
        searched++
        const result = simulate(initial, action, false)!
        const loot = result.loot - result.lost
        if (loot > 0 && (!harvest || loot > harvest.loot ||
          (loot === harvest.loot && lineupPriority(action) > lineupPriority(harvest.action)))) {
          harvest = { action, loot }
        }
      }
    }
    return { action: harvest?.action ?? null, path: harvest ? [harvest.action] : [], depth: requestedDepth,
      survived: harvest ? 1 : 0, searched, status: 'clear', pruned: false, normalPruned: false, rescue: false }
  }
  const normal = run(false)
  const rescue = !normal.goal && !normal.stalled && Boolean(available.fire || available.ice) ? run(true) : undefined
  const partialRescue = rescue && rescue.longest.state.turn > normal.longest.state.turn ? rescue.longest : undefined
  const best = normal.goal ?? rescue?.goal ?? partialRescue ?? normal.longest
  if (normal.scoringMove && !best.path.length) {
    const { action } = normal.scoringMove
    return { action, path: [action], depth: requestedDepth, survived: 0, searched,
      status: 'final-score', pruned: normal.pruned, normalPruned: normal.pruned, rescue: false }
  }
  const status = best.value[0] ? 'clear' : best.state.turn - initial.turn >= requestedDepth ? 'safe' :
    best.path.length ? 'limited' : normal.stalled ? 'stalled' : 'impossible'
  return {
    action: best.path[0] ?? null, path: best.path, depth: requestedDepth, survived: best.state.turn - initial.turn,
    searched, status, pruned: normal.pruned || Boolean(rescue?.pruned), normalPruned: normal.pruned,
    rescue: best.spells > 0,
  }
}
