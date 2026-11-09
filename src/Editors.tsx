import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Art'
import { colOf, COLS, defaultRules, ENEMY_ROWS, enemyName, isLarge, largeAnchorFits, LEVELS, names, rowOf } from './game/model'
import type { Enemy, Partner, Rules, State } from './game/model'
import { encodeBoard, parseBoard } from './game/storage'

export function Dialog({ title, eyebrow, children, close, wide = false }: {
  title: string; eyebrow: string; children: ReactNode; close: () => void; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className={wide ? 'dialog wide' : 'dialog'} aria-labelledby="dialog-title"
    onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === ref.current) close() }}>
    <div className="dialog-inner">
      <div className="dialog-head"><div><span className="eyebrow">{eyebrow}</span><h2 id="dialog-title">{title}</h2></div>
        <button className="icon-button" onClick={close} aria-label="关闭"><Icon name="close"/></button></div>
      {children}
    </div>
  </dialog>
}

export function Numeric({ label, value, onChange, min = 0, max = 9999 }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number
}) {
  return <label className="input-label">{label}<input type="number" inputMode="numeric" value={Number.isNaN(value) ? '' : value}
    required min={min} max={max} step={1} onChange={event => onChange(event.currentTarget.valueAsNumber)}/></label>
}

function Select<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (value: T) => void; options: readonly (readonly [T, string])[]
}) {
  return <label className="input-label">{label}<select value={value} onChange={event => onChange(event.target.value as T)}>
    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>
}

const freshZombie = (): Enemy => ({ kind: 'zombie', variant: 'normal', hp: 1, initialHp: 1 })
const powerOptions = LEVELS.map((power, index) => [String(power), `${power}（${index + 1} 级）`] as const)

export function EnemyEditor({ state, index, save, close }: {
  state: State; index: number; save: (dest: number, enemies: Enemy[]) => string | void; close: () => void
}) {
  const [items, setItems] = useState<Enemy[]>(() => state.enemies[index].length ? [...state.enemies[index]] : [freshZombie()])
  const [dest, setDest] = useState(index)
  const [error, setError] = useState('')
  const hasLarge = items.some(isLarge)
  return <Dialog title={`编辑僵尸格 · ${rowOf(index) + 1} 排 ${colOf(index) + 1} 列`} eyebrow="BOARD SYNC" close={close}>
    <p className="muted">可输入多个同格单位。保存后直接同步棋盘。</p>
    <form onSubmit={event => {
      event.preventDefault()
      if (hasLarge && !largeAnchorFits(dest)) {
        setError('大型邪祟需要占两列，左下格请选择第 1–4 列。')
        return
      }
      setError(save(dest, items) ?? '')
    }}>
      <div className="form-grid">
        <Select label="目标排" value={String(rowOf(dest) + 1)} options={Array.from({ length: ENEMY_ROWS }, (_, i) => [String(i + 1), `第 ${i + 1} 排`])}
          onChange={row => setDest((Number(row) - 1) * COLS + colOf(dest))}/>
        <Select label="目标列" value={String(colOf(dest) + 1)} options={Array.from({ length: COLS }, (_, i) => [String(i + 1), `第 ${i + 1} 列`])}
          onChange={col => setDest(rowOf(dest) * COLS + Number(col) - 1)}/>
      </div>
      {hasLarge && <p className="hint">目标格是大型邪祟的左下角，向上和向右展开。
        {dest < COLS && ' 上半身在棋盘外，随下一次前进进入棋盘。'}</p>}
      {dest !== index && state.enemies[dest].length > 0 && <p className="hint">目标格已有单位，保存时会叠放在该格。</p>}
      {items.map((enemy, position) => {
        const update = (next: Enemy) => setItems(items.map((item, i) => i === position ? next : item))
        const type = enemy.kind === 'zombie' ? enemy.variant : enemy.kind
        return <div className="unit-editor" key={position}>
          <div className="editor-row"><strong>{enemyName(enemy)} · {position + 1}</strong>
            <button type="button" className="text-button danger-text" onClick={() => setItems(items.filter((_, i) => i !== position))}>删除单位</button></div>
          <Select label="类型" value={type} options={ [['normal', '普通僵尸'], ['special', '特殊僵尸'], ['large', '大型邪祟（2 × 2）'], ['book', names.book], ['bottle', names.bottle]] }
            onChange={kind => {
              if (kind === 'book' || kind === 'bottle') update({ kind, hp: kind === 'book' ? state.rules.bookHp : state.rules.bottleHp })
              else update({ kind: 'zombie', variant: kind, hp: enemy.hp, initialHp: enemy.kind === 'zombie' ? enemy.initialHp : enemy.hp })
            }}/>
          <div className="form-grid"><Numeric label="当前血量" min={1} value={enemy.hp}
            onChange={hp => update(enemy.kind === 'zombie' ? { ...enemy, hp, initialHp: Math.max(hp || 0, enemy.initialHp || 0) } : { ...enemy, hp })}/>
            {enemy.kind === 'zombie' && <Numeric label="初始血量" min={enemy.hp || 1} value={enemy.initialHp} onChange={initialHp => update({ ...enemy, initialHp })}/>}</div>
        </div>
      })}
      <button className="subtle-button" type="button" disabled={items.length >= 64} onClick={() => setItems([...items, freshZombie()])}><Icon name="plus" size={15}/> 添加同格单位</button>
      {error && <p className="danger-text" role="alert">{error}</p>}
      <div className="dialog-actions">
        {state.enemies[index].length > 0 && <button className="text-button danger-text" type="button" onClick={() => save(index, [])}>清空此格</button>}
        <button className="primary" type="submit">保存格子</button></div>
    </form>
  </Dialog>
}

export function PartnerEditor({ title, partner, maxLevel, save, close }: {
  title: string; partner: Partner | null; maxLevel: number; save: (partner: Partner | null) => void; close: () => void
}) {
  const [role, setRole] = useState(partner?.role ?? 'li')
  const [level, setLevel] = useState(String(partner?.level ?? 1))
  return <Dialog title={title} eyebrow="PARTNER SYNC" close={close}>
    <p className="muted">编辑阵容不会结算回合。</p>
    <form onSubmit={event => { event.preventDefault(); save({ role, level: Number(level) }) }}>
      <div className="form-grid">
        <Select label="角色" value={role} onChange={setRole} options={ [['li', names.li], ['qin', names.qin]] }/>
        <Select label="棋盘显示的攻击力" value={level} onChange={setLevel}
          options={powerOptions.filter(([power]) => Number(power) <= maxLevel || Number(power) === partner?.level)}/>
      </div>
      <div className="dialog-actions">{partner && <button className="text-button danger-text" type="button" onClick={() => save(null)}>删除伙伴</button>}
        <button className="primary" type="submit">保存伙伴</button></div>
    </form>
  </Dialog>
}

export function BatchEditor({ state, close, save }: { state: State; close: () => void; save: (enemies: Enemy[][]) => void }) {
  const [draft, setDraft] = useState(encodeBoard(state))
  const [error, setError] = useState('')
  return <Dialog title="批量同步僵尸区" eyebrow="BATCH EDIT" close={close} wide>
    <p className="muted">从上到下 6 行，每行 5 格，以空格分隔。<code>.</code> 为空格，<code>5/20</code> 为当前 5 血、初始 20 血，<code>S</code> 标记特殊僵尸，<code>L71</code> 在左下格录入 71 血的大型邪祟，<code>B</code> 为追远密卷，<code>R</code> 为血瓷瓶，<code>+</code> 连接同格单位。</p>
    <form onSubmit={event => {
      event.preventDefault()
      try { save(parseBoard(draft, state.rules)) } catch (failure) { setError((failure as Error).message) }
    }}>
      <label className="input-label">僵尸区数据<textarea className="mono" rows={7} value={draft} onChange={event => setDraft(event.target.value)} spellCheck={false} autoCapitalize="off"/></label>
      {error && <p className="danger-text" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="primary" type="submit">覆盖僵尸区</button></div>
    </form>
  </Dialog>
}

export const resourceLabels = { drinks: '饮料', score: '积分', fire: '火焰符', ice: '冰冻符', turn: '当前回合', frozen: '剩余冻结回合' }
type Resource = keyof typeof resourceLabels
export function ResourcesEditor({ state, close, save }: { state: State; close: () => void; save: (state: State) => void }) {
  const [draft, setDraft] = useState(state)
  const keys = Object.keys(resourceLabels) as Resource[]
  return <Dialog title="同步回合资源" eyebrow="RESOURCE SYNC" close={close}>
    <form onSubmit={event => { event.preventDefault(); save(draft) }}>
      <div className="form-grid">{keys.map(key => <Numeric key={key} label={resourceLabels[key]} value={draft[key]} max={key === 'frozen' ? 12 : 1_000_000_000}
        onChange={value => setDraft({ ...draft, [key]: value })}/>)}</div>
      {draft.failed && <label className="check-label"><input type="checkbox" checked={!draft.failed} onChange={() => setDraft({ ...draft, failed: false })}/> 清除失败标记</label>}
      <div className="dialog-actions"><button className="primary" type="submit">保存资源</button></div>
    </form>
  </Dialog>
}

export function RulesEditor({ state, close, save }: { state: State; close: () => void; save: (state: State) => void }) {
  const [draft, setDraft] = useState(state.rules)
  const [level, setLevel] = useState(1)
  const [error, setError] = useState('')
  const set = <K extends keyof Rules>(key: K, value: Rules[K]) => setDraft({ ...draft, [key]: value })
  const li = draft.li[level]
  function saveRules() {
    if (state.bench.slice(draft.benchCapacity).some(Boolean)) {
      setError('缩容会挤掉伙伴。请先清空超出新容量的格子。')
      return
    }
    const valid = LEVELS.every(value => [draft.li[value].total, draft.li[value].shots, draft.li[value].shotDamage, draft.qin[value]].every(Number.isFinite))
    if (!valid) { setError('请补全每个已编辑等级的伤害和符纸数量。'); return }
    save({ ...state, rules: draft, bench: Array.from({ length: draft.benchCapacity }, (_, index) => state.bench[index] ?? null) })
  }
  return <Dialog title="规则校准" eyebrow="RULE CALIBRATION" close={close} wide>
    <p className="hint"><b>微信游戏规则</b> · 休息区伙伴只可放到上阵区空格。移动、合成和交换在上阵区内进行，合成攻击力翻倍，最高 10 级。所有上阵伙伴攻击后，邪祟再前进。</p>
    <p className="hint gold-hint"><b>实局校准</b> · 默认秦璃先攻，李追远逐张结算符纸，击杀后剩余符纸继续打后方。密卷和血瓷瓶随邪祟前进。道具是否随冰冻停步可调整。</p>
    <form onSubmit={event => { event.preventDefault(); saveRules() }}>
      <h3>角色伤害</h3>
      <Select label="校准攻击力" value={String(level)} onChange={value => setLevel(Number(value))} options={powerOptions}/>
      <div className="form-grid">
        <Numeric label="李追远 · 总伤害上限" value={li.total} onChange={total => set('li', { ...draft.li, [level]: { ...li, total } })}/>
        <Numeric label="李追远 · 符纸张数" value={li.shots} min={1} max={64} onChange={shots => set('li', { ...draft.li, [level]: { ...li, shots } })}/>
        <Numeric label="李追远 · 单张伤害" value={li.shotDamage} onChange={shotDamage => set('li', { ...draft.li, [level]: { ...li, shotDamage } })}/>
        <Numeric label="秦璃 · 每只僵尸伤害" value={draft.qin[level]} onChange={value => set('qin', { ...draft.qin, [level]: value })}/>
      </div>
      <label className="check-label"><input type="checkbox" checked={li.retarget} onChange={event => set('li', { ...draft.li, [level]: { ...li, retarget: event.target.checked } })}/> 击杀后剩余符纸可改打其他目标</label>
      <h3>战斗结算</h3>
      <div className="form-grid">
        <Select label="攻击顺序" value={draft.attackOrder} onChange={value => set('attackOrder', value)}
          options={ [['front', '前排先攻'], ['back', '后排先攻'], ['li', '李追远优先'], ['qin', '秦璃优先']] }/>
        <Select label="李追远破坏道具条件" value={draft.propTarget} onChange={value => set('propTarget', value)}
          options={ [['after-zombies', '该列无僵尸时'], ['lowest', '可优先攻击更低处的道具'], ['disabled', '关闭道具破坏']] }/>
        <Select label="道具掉落时机" value={draft.propTiming} onChange={value => set('propTiming', value)}
          options={ [['after-attacks', '全员攻击后'], ['immediate', '破坏后立即']] }/>
        <Select label="道具移动" value={draft.propMovement} onChange={value => set('propMovement', value)}
          options={ [['with-enemies', '随邪祟前进或停步'], ['every-turn', '每回合前进'], ['stationary', '留在原格']] }/>
        <Select label="目标格有单位时" value={draft.collision} onChange={value => set('collision', value)}
          options={ [['stack', '允许同格'], ['hold', '原地停留']] }/>
        <Numeric label="新秘卷血量" value={draft.bookHp} min={1} onChange={value => set('bookHp', value)}/>
        <Numeric label="新血瓷瓶血量" value={draft.bottleHp} min={1} onChange={value => set('bottleHp', value)}/>
        <Numeric label="冰冻持续回合" value={draft.freezeTurns} min={1} max={12} onChange={value => set('freezeTurns', value)}/>
        <Numeric label="底线（最后安全排）" value={draft.boundary} min={1} max={6} onChange={value => set('boundary', value)}/>
      </div>
      <label className="check-label"><input type="checkbox" checked={draft.blockWithPartner}
        onChange={event => set('blockWithPartner', event.target.checked)}/> 允许同列前排伙伴阻挡底线突破</label>
      <h3>阵容与合成</h3>
      <div className="form-grid">
        <Numeric label="休息区容量" value={draft.benchCapacity} max={24} onChange={value => set('benchCapacity', value)}/>
        <Select label="合成范围" value={draft.mergeScope} onChange={value => set('mergeScope', value)}
          options={ [['all', '允许跨区合成'], ['same-zone', '仅同区合成'], ['field', '仅上场伙伴合成']] }/>
        <Select label="合成上限" value={String(draft.maxLevel)} onChange={value => set('maxLevel', Number(value))}
          options={powerOptions}/>
      </div>
      <label className="check-label"><input type="checkbox" checked={draft.allowReturn}
        onChange={event => set('allowReturn', event.target.checked)}/> 允许伙伴回休息区及与休息区交换</label>
      {error && <p className="danger-text" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="subtle-button" type="button"
        onClick={() => setDraft({ ...defaultRules(), benchCapacity: state.rules.benchCapacity })}>载入微信默认规则</button>
        <button className="primary" type="submit">保存校准规则</button></div>
    </form>
  </Dialog>
}
