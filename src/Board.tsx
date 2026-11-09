import { useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { colOf, COLS, enemyName, isLarge, names, occupiedCells, rowOf, sameSlot, slotKey, slotName } from './game/model'
import type { Move, Slot, State } from './game/model'
import { EnemyArt, Icon, Portrait } from './Art'

type Props = {
  state: State; mode: 'play' | 'edit'; selected: Slot | null; preview?: Move
  fireMode: boolean; cellClick: (index: number) => void; partnerClick: (slot: Slot) => void
  transfer: (from: Slot, to: Slot) => void; batch: () => void; clearEnemies: () => void
  clearPartners: (zone: Slot['zone']) => void
}

function largeAnchors(enemies: State['enemies']) {
  const anchors = new Map<number, number>()
  enemies.forEach((cell, index) => {
    for (const enemy of cell) {
      if (!isLarge(enemy)) continue
      for (const occupied of occupiedCells(index, enemy)) anchors.set(occupied, index)
    }
  })
  return anchors
}

function outsideTopColumns(enemies: State['enemies']) {
  const firstRow = enemies.slice(0, COLS).map(cell => cell.some(isLarge))
  return firstRow.map((anchor, col) => anchor || firstRow[col - 1])
}

export function Board({ state, mode, selected, preview, fireMode, cellClick, partnerClick, transfer, batch, clearEnemies, clearPartners }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [arrow, setArrow] = useState('')
  const drag = useRef<{ from: Slot; x: number; y: number } | null>(null)
  const ignoreClick = useRef(false)
  const origin = preview && slotKey(preview.from)
  const destination = preview && slotKey(preview.to)
  const anchors = largeAnchors(state.enemies)
  const outsideTop = outsideTopColumns(state.enemies)
  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board || !origin || !destination) { setArrow(''); return }
    const update = () => {
      const start = board.querySelector(`[data-slot="${origin}"]`)?.getBoundingClientRect()
      const end = board.querySelector(`[data-slot="${destination}"]`)?.getBoundingClientRect()
      if (!start || !end) return
      const box = board.getBoundingClientRect()
      const x = start.left + start.width / 2 - box.left
      const y = start.top + start.height / 2 - box.top
      const ex = end.left + end.width / 2 - box.left
      const ey = end.top + end.height / 2 - box.top
      const length = Math.hypot(ex - x, ey - y)
      const stopX = ex - (ex - x) / length * 11
      const stopY = ey - (ey - y) / length * 11
      setArrow(`M ${x} ${y} Q ${(x + ex) / 2} ${(y + ey) / 2 - 15} ${stopX} ${stopY}`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(board)
    return () => observer.disconnect()
  }, [origin, destination])

  function pointerDown(event: PointerEvent<HTMLButtonElement>, from: Slot) {
    ignoreClick.current = false
    if (event.pointerType !== 'mouse' || event.button !== 0 || mode !== 'play' || !state[from.zone][from.index]) return
    drag.current = { from, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    drag.current = null
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) return
    ignoreClick.current = true
    const key = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-slot]')?.dataset.slot
    if (!key) return
    const [zone, index] = key.split(':')
    if (zone === 'field' || zone === 'bench') transfer(start.from, { zone, index: Number(index) })
  }

  function partnerTile(zone: Slot['zone'], index: number) {
    const slot = { zone, index }
    const key = slotKey(slot)
    const partner = state[zone][index]
    const active = sameSlot(selected, slot)
    return <button type="button" key={key} data-slot={key}
      className={`tile partner-tile ${partner?.role ?? 'vacant'} ${active ? 'selected' : ''} ${key === origin ? 'suggested from' : ''} ${key === destination ? 'suggested to' : ''}`}
      aria-label={`${slotName(slot)}：${partner ? names[partner.role] + ' 攻击力 ' + partner.level : '空格'}`} aria-pressed={active}
      onPointerDown={event => pointerDown(event, slot)} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null }}
      onClick={() => { if (!ignoreClick.current) partnerClick(slot); ignoreClick.current = false }}>
      {partner ? <><Portrait partner={partner}/><span className="partner-name">{names[partner.role]}</span><b className="level">{partner.level}</b></> :
        <span className="cell-plus"><Icon name="plus" size={15}/></span>}
    </button>
  }

  return <div className="board-area" ref={boardRef}>
    <div className="board-map">
      <div className="map-head">
        <div className="section-label"><span className="section-icon"><Icon name="grid" size={15}/></span><h2>僵尸区</h2><span className="dimension">6 × 5</span></div>
        <div className="map-actions">
          <button className="text-button danger-text" onClick={clearEnemies} disabled={state.enemies.every(cell => cell.length === 0)}>清空僵尸区</button>
          <button className="text-button" onClick={batch}><Icon name="edit" size={15}/> 批量编辑</button>
        </div>
      </div>
      <div className="map-body">
        <div className="coordinates"><span/>{[1, 2, 3, 4, 5].map(n => <span key={n}>{String(n).padStart(2, '0')}</span>)}</div>
        {outsideTop.some(Boolean) && <div className="coordinates enemy-overflow" role="group" aria-label="大型邪祟的棋盘外占位">
          <span>外</span>
          {outsideTop.map((covered, col) => covered ? <span key={col} className="large-mark">棋盘外</span> : <span key={col}/>)}
        </div>}
        <div className="indexed-grid">
          {state.enemies.map((cell, index) => {
            const row = rowOf(index) + 1
            const anchor = anchors.get(index)
            const danger = (row >= state.rules.boundary && cell.some(enemy => enemy.kind === 'zombie')) ||
              (anchor !== undefined && rowOf(anchor) + 1 >= state.rules.boundary)
            const enemy = cell.find(item => item.kind === 'zombie') ?? cell[0]
            const description = enemy ? cell.map(item => enemyName(item) + ' ' + item.hp + ' 血').join('、') :
              anchor !== undefined ? '大型邪祟占格' : '空格'
            return <div className="grid-fragment" key={index}>
              {colOf(index) === 0 && <span className={`row-index ${row === state.rules.boundary ? 'boundary-index' : ''}`}>{row}</span>}
              <button className={`tile enemy-tile ${enemy?.kind ?? ''} ${anchor !== undefined ? 'large-tile' : ''} ${danger ? 'danger' : ''} ${row === state.rules.boundary ? 'boundary-tile' : ''} ${fireMode ? 'fire-target' : ''}`}
                data-enemy={index} aria-label={`僵尸区 ${row} 排 ${colOf(index) + 1} 列：${description}`}
                onClick={() => cellClick(fireMode || enemy ? index : anchor ?? index)}>
                {enemy ? <><EnemyArt enemy={enemy}/><b className="hp">{enemy.hp}</b>{cell.length > 1 && <span className="stack">×{cell.length}</span>}</> :
                  anchor !== undefined ? <span className="large-mark">占格</span> : <i className="cell-dot"/>}
              </button>
            </div>
          })}
        </div>
        <div className="boundary"><span/> <b>防线 · 第 {state.rules.boundary} 排</b> <span/></div>
      </div>
      <div className="map-head field-head">
        <div className="section-label"><span className="section-icon gold"><Icon name="shield" size={15}/></span><h2>伙伴区</h2><span className="dimension">2 × 5</span></div>
        <div className="map-actions">
          <span className="map-hint">同列攻击</span>
          <button className="text-button danger-text" onClick={() => clearPartners('field')} disabled={!state.field.some(Boolean)}>清空伙伴区</button>
        </div>
      </div>
      <div className="map-body field-body">
        <div className="indexed-grid">{state.field.map((_, index) => <div className="grid-fragment" key={index}>
          {colOf(index) === 0 && <span className="row-index field-index">{rowOf(index) + 1}</span>}{partnerTile('field', index)}
        </div>)}</div>
      </div>
    </div>
    <div className="bench panel">
      <div className="map-head">
        <div className="section-label"><span className="section-icon"><Icon name="layers" size={15}/></span><h2>休息区</h2><span className="dimension">{state.bench.filter(Boolean).length} / {state.bench.length}</span></div>
        <div className="map-actions">
          <span className="map-hint">剩余 {state.bench.filter(item => !item).length} 格</span>
          <button className="text-button danger-text" onClick={() => clearPartners('bench')} disabled={!state.bench.some(Boolean)}>清空休息区</button>
        </div>
      </div>
      <div className="bench-grid">{state.bench.map((_, index) => partnerTile('bench', index))}</div>
      {state.bench.length === 0 && <p className="muted bench-note">休息区容量为 0</p>}
    </div>
    {arrow && <svg className="move-arrow" aria-hidden="true">
      <defs><marker id="arrow-tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="m0 0 10 5-10 5 3-5Z" fill="#73edd1"/></marker></defs>
      <path d={arrow} fill="none" stroke="#0b231e" strokeWidth="6" strokeLinecap="round"/>
      <path d={arrow} fill="none" stroke="#73edd1" strokeWidth="2.4" strokeLinecap="round" markerEnd="url(#arrow-tip)"/>
    </svg>}
  </div>
}

export function MiniBoard({ state, caption }: { state: State; caption: string }) {
  const anchors = largeAnchors(state.enemies)
  const outsideTop = outsideTopColumns(state.enemies)
  return <div className="mini-board"><strong>{caption}</strong><div className="mini-grid">
    {outsideTop.some(Boolean) && outsideTop.map((covered, col) => covered ?
      <span key={`outside-${col}`} className="large-tile" title="大型邪祟棋盘外占格">外</span> : <i key={`outside-${col}`}/>)}
    {state.enemies.map((cell, index) => {
      const enemy = cell.find(unit => unit.kind === 'zombie') ?? cell[0]
      const covered = anchors.has(index)
      return <span key={index} className={covered ? 'large-tile' : enemy?.kind ?? ''}
        title={enemy ? cell.map(unit => `${enemyName(unit)} ${unit.hp} 血`).join('、') : covered ? '大型邪祟占格' : undefined}>
        {enemy ? enemy.kind === 'zombie' ? enemy.hp : enemy.kind === 'book' ? '卷' : '瓶' : covered ? '占' : '·'}
      </span>
    })}
    {state.field.map((partner, index) => <span key={index + 30} className={`mini-field ${partner?.role ?? ''}`}
      title={partner ? names[partner.role] + ' ' + partner.level : '空格'}>{partner ? (partner.role === 'li' ? '李' : '秦') + partner.level : '·'}</span>)}
  </div></div>
}
