import { applyPlacement, colOf, COLS, enemyColumns, enemyName, moveBetween, names, occupiedCells, rowOf } from './model'
import type { Action, Enemy, Prop, State } from './model'

export const NORMAL_TURN_SCORE = 10

export type Hit = {
  index: number; name: string; damage: number; before: number; after: number; killed: boolean
}
export type Outcome = {
  state: State; hits: Hit[]; notes: string[]; killed: number; loot: number; lost: number
}

export function simulate(state: State, action: Action, report = true): Outcome | null {
  if (state.failed) return null
  if (action.kind === 'fire') {
    if (!state.fire || !Number.isInteger(action.col) || action.col < 0 || action.col >= COLS ||
      !state.enemies.some((cell, index) => cell.some(enemy => enemy.kind === 'zombie' && enemyColumns(index, enemy).includes(action.col)))) return null
  } else if (action.kind === 'ice') {
    if (!state.ice || state.frozen) return null
  } else if (!state.drinks || moveBetween(state, action.from, action.to)?.kind !== action.kind) {
    return null
  }

  const next = action.kind === 'fire' || action.kind === 'ice'
    ? { ...state, bench: [...state.bench] } : applyPlacement(state, action)
  next.enemies = state.enemies.map(cell => cell.map(enemy => ({ ...enemy })))
  const outcome: Outcome = { state: next, hits: [], notes: [], killed: 0, loot: 0, lost: 0 }
  const props: Prop[] = []
  const note = (value: string) => { if (report) outcome.notes.push(value) }

  function hit(index: number, enemy: Enemy, damage: number) {
    if (!damage || enemy.hp <= 0) return
    const before = enemy.hp
    enemy.hp = Math.max(0, before - damage)
    const killed = enemy.hp === 0
    if (report) outcome.hits.push({ index, name: enemyName(enemy), damage: before - enemy.hp, before, after: enemy.hp, killed })
    if (!killed) return
    if (enemy.kind === 'zombie') {
      next.score += enemy.initialHp
      outcome.killed++
    } else {
      props.push(enemy)
      if (next.rules.propTiming === 'immediate') collectLoot()
    }
  }

  function collectLoot() {
    for (const prop of props) {
      const role = prop.kind === 'book' ? 'li' : 'qin'
      const slot = next.bench.indexOf(null)
      if (slot < 0) {
        outcome.lost++
        note(`休息区已满，丢失 1 级${names[role]}`)
      } else {
        next.bench[slot] = { role, level: 1 }
        outcome.loot++
        note(`${names[prop.kind]}破碎，1 级${names[role]}进入休息区`)
      }
    }
    props.length = 0
  }

  if (action.kind === 'ice') {
    next.ice--
    next.frozen = next.rules.freezeTurns
    note(`冻结全场，接下来 ${next.frozen} 个正常回合僵尸停步`)
    return outcome
  }
  if (action.kind === 'fire') {
    next.fire--
    for (let index = 0; index < next.enemies.length; index++) {
      for (const enemy of next.enemies[index]) {
        if (enemy.kind === 'zombie' && enemyColumns(index, enemy).includes(action.col)) hit(index, enemy, enemy.hp)
      }
      next.enemies[index] = next.enemies[index].filter(enemy => enemy.hp > 0)
    }
    return outcome
  }

  next.drinks--
  next.score += NORMAL_TURN_SCORE
  next.turn++
  const { rules } = next
  const actors = next.field.flatMap((partner, index) => partner ? [{ partner, index }] : [])
  if (rules.attackOrder === 'back') actors.sort((a, b) => rowOf(b.index) - rowOf(a.index) || a.index - b.index)
  if (rules.attackOrder === 'li' || rules.attackOrder === 'qin') {
    actors.sort((a, b) => Number(b.partner.role === rules.attackOrder) - Number(a.partner.role === rules.attackOrder))
  }
  const targetsByColumn: { index: number; enemy: Enemy }[][] = Array.from({ length: COLS }, () => [])
  for (let index = next.enemies.length - 1; index >= 0; index--) {
    for (const enemy of next.enemies[index]) {
      for (const col of enemyColumns(index, enemy)) targetsByColumn[col].push({ index, enemy })
    }
  }
  for (const { partner, index } of actors) {
    const targets = targetsByColumn[colOf(index)]
    if (partner.role === 'qin') {
      for (const target of targets) if (target.enemy.kind === 'zombie') hit(target.index, target.enemy, rules.qin[partner.level])
      continue
    }

    const config = rules.li[partner.level]
    let remaining = config.total
    const findTarget = () => {
      const live = targets.filter(({ enemy }) => enemy.hp > 0)
      const zombie = live.find(({ enemy }) => enemy.kind === 'zombie')
      if (rules.propTarget === 'lowest') return live[0]
      if (rules.propTarget === 'disabled') return zombie
      return zombie ?? live[0]
    }
    let target = findTarget()
    for (let shot = 0; shot < config.shots && target && remaining > 0; shot++) {
      const damage = Math.min(remaining, config.shotDamage)
      hit(target.index, target.enemy, damage)
      remaining -= damage
      if (target.enemy.hp === 0) target = config.retarget ? findTarget() : undefined
    }
  }
  collectLoot()
  next.enemies = next.enemies.map(cell => cell.filter(enemy => enemy.hp > 0))

  const breached = (index: number) => rowOf(index) >= rules.boundary
  if (next.enemies.some((cell, index) => breached(index) && cell.some(enemy => enemy.kind === 'zombie'))) {
    next.failed = true
    note('攻击结算后，仍有僵尸处于设定底线之外')
    return outcome
  }

  const frozen = next.frozen > 0
  if (frozen) {
    next.frozen--
    note('冰冻生效，僵尸本回合停步')
  }

  const propsAdvance = rules.propMovement === 'every-turn' || (!frozen && rules.propMovement === 'with-enemies')
  const movers: { index: number; enemy: Enemy }[] = []
  for (let index = next.enemies.length - 1; index >= 0; index--) {
    const cell = next.enemies[index]
    for (const enemy of cell) {
      if (enemy.kind === 'zombie' ? !frozen : propsAdvance) movers.push({ index, enemy })
    }
  }
  for (const { index, enemy } of movers) {
    const dest = index + COLS
    if (breached(dest)) {
      if (enemy.kind !== 'zombie') {
        next.enemies[index].splice(next.enemies[index].indexOf(enemy), 1)
      } else if (!rules.blockWithPartner || !enemyColumns(index, enemy).every(col => next.field[col])) {
        next.failed = true
        note(`第 ${colOf(index) + 1} 列的${enemyName(enemy)}突破底线（${enemy.hp} 血）`)
      }
      continue
    }
    if (rules.collision === 'hold') {
      const previous = occupiedCells(index, enemy)
      const leading = occupiedCells(dest, enemy).filter(cell => !previous.includes(cell))
      const occupied = next.enemies.some((cell, anchor) => cell.some(unit =>
        unit !== enemy && occupiedCells(anchor, unit).some(tile => leading.includes(tile))))
      if (occupied) continue
    }
    next.enemies[index].splice(next.enemies[index].indexOf(enemy), 1)
    next.enemies[dest].push(enemy)
  }
  return outcome
}
