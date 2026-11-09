import { useEffect, useRef, useState } from 'react'
import { Analysis, Preview } from './Analysis'
import { Icon } from './Art'
import { Board } from './Board'
import { BatchEditor, Dialog, EnemyEditor, PartnerEditor, ResourcesEditor, RulesEditor } from './Editors'
import { ScreenshotImport } from './ScreenshotImport'
import { simulate } from './game/combat'
import { commit, redo, undo } from './game/history'
import { colOf, demoState, describe, emptyState, moveBetween, replaceCell, sameSlot, slotName, wechatSample } from './game/model'
import type { Action, Slot, State } from './game/model'
import { canRecognizeScreenshots } from './game/screenshot'
import type { Recommendation } from './game/search'
import { asText, exportState, importState, LIVE_KEY, readHistory, SAVE_KEY } from './game/storage'

type Modal = { type: 'enemy'; index: number } | { type: 'partner'; slot: Slot } |
  { type: 'batch' | 'rules' | 'resources' | 'archive' | 'sync' | 'preview' | 'reset' | 'wechat' | 'screenshot' }

function download(state: State) {
  const url = URL.createObjectURL(new Blob([exportState(state)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `走江踏浪-回合${state.turn}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const [history, setHistory] = useState(readHistory)
  const state = history.present
  const [mode, setMode] = useState<'play' | 'edit'>('play')
  const [selected, setSelected] = useState<Slot | null>(null)
  const [fireMode, setFireMode] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [result, setResult] = useState<Recommendation | null>(null)
  const [running, setRunning] = useState(false)
  const [depth, setDepth] = useState(4)
  const [storageOk, setStorageOk] = useState(true)
  const [status, setStatus] = useState('')
  const [lastLog, setLastLog] = useState<string[]>([])
  const [sync, setSync] = useState('')
  const [syncError, setSyncError] = useState('')
  const worker = useRef<Worker | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const statusTimer = useRef<number | undefined>(undefined)
  const close = () => { setModal(null); setScreenshot(null) }
  const action = result?.action

  useEffect(() => {
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(history)); setStorageOk(true) }
    catch { setStorageOk(false) }
  }, [history])
  useEffect(() => () => { worker.current?.terminate(); window.clearTimeout(statusTimer.current) }, [])
  useEffect(() => {
    if (!canRecognizeScreenshots) return
    function pasteImage(event: ClipboardEvent) {
      if (modal && modal.type !== 'screenshot') return
      const clipboard = event.clipboardData
      const image = Array.from(clipboard?.files ?? []).find(file => file.type.startsWith('image/')) ??
        Array.from(clipboard?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
      if (!image) return
      event.preventDefault()
      setScreenshot(image)
      setModal({ type: 'screenshot' })
    }
    window.addEventListener('paste', pasteImage)
    return () => window.removeEventListener('paste', pasteImage)
  }, [modal])

  function notify(text: string) {
    setStatus(text)
    window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(''), 5000)
  }
  function clearAnalysis() {
    worker.current?.terminate()
    worker.current = null
    setRunning(false)
    setResult(null)
  }
  function clearSelection() { setSelected(null); setFireMode(false) }
  function update(next: State, message?: string) {
    clearAnalysis()
    clearSelection()
    setLastLog([])
    setHistory(current => commit(current, next))
    close()
    if (message) notify(message)
  }
  function perform(move: Action) {
    const outcome = simulate(state, move)
    if (!outcome) {
      notify(state.failed ? '防线已失守，请撤销或手动同步。' : move.kind === 'fire' ? '请选择存在僵尸的列，并确认还有火焰符。' :
        move.kind === 'ice' ? '冰冻符不足，或冰冻已生效。' : state.drinks ? '该伙伴操作不符合当前规则。' : '饮料不足，请先同步资源。')
      return
    }
    const log = [describe(state, move), ...outcome.notes]
    if (outcome.killed) log.push(`击杀 ${outcome.killed} 只僵尸，积分 +${outcome.state.score - state.score}`)
    update(outcome.state, outcome.state.failed ? '防线失守。可撤销后尝试其他走法。' : outcome.notes.at(-1) ?? '操作已结算')
    setLastLog(log)
  }
  function transfer(from: Slot, to: Slot) {
    const move = moveBetween(state, from, to)
    if (move) perform(move)
    else notify('无法移动、交换或合成到这个格子。')
  }
  function clickPartner(slot: Slot) {
    if (fireMode) { setFireMode(false); return }
    if (mode === 'edit') { setModal({ type: 'partner', slot }); return }
    if (sameSlot(selected, slot)) { setSelected(null); return }
    if (selected) { transfer(selected, slot); return }
    if (state[slot.zone][slot.index]) setSelected(slot)
    else {
      setMode('edit')
      setModal({ type: 'partner', slot })
    }
  }
  function travel(direction: 'undo' | 'redo') {
    clearAnalysis()
    clearSelection()
    setLastLog([])
    setHistory(current => direction === 'undo' ? undo(current) : redo(current))
    notify(direction === 'undo' ? '已撤销上次变更' : '已重做上次变更')
  }
  function analyze() {
    clearSelection()
    setRunning(true)
    try {
      const current = new Worker(new URL('./game/search.worker.ts', import.meta.url), { type: 'module' })
      worker.current = current
      current.onmessage = ({ data }: MessageEvent<Recommendation>) => {
        if (worker.current !== current) return
        clearAnalysis()
        setResult(data)
      }
      current.onerror = () => {
        if (worker.current !== current) return
        clearAnalysis()
        notify('推演引擎启动失败，请重新加载页面后重试。')
      }
      current.postMessage({ state, depth })
    } catch {
      clearAnalysis()
      notify('当前浏览器无法启动推演引擎。')
    }
  }
  function openSync(content: string) {
    setSync(content)
    setSyncError('')
    setModal({ type: 'sync' })
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(asText(state)); notify('已复制局面文本'); close() }
    catch { openSync(asText(state)) }
  }
  function saveArchive() {
    try { localStorage.setItem(SAVE_KEY, exportState(state)); notify('已更新手动存档'); close() }
    catch { notify('浏览器存储不可用，可导出 JSON 存档。') }
  }
  function loadArchive() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) { notify('尚无手动存档。'); return }
      update(importState(raw), '已读取手动存档')
    } catch { notify('无法读取手动存档。') }
  }
  const resources = [
    { label: '饮料', value: state.drinks, icon: 'bottle', className: 'mint', trigger: () => setModal({ type: 'resources' }) },
    { label: '积分', value: state.score, icon: 'trophy', className: 'gold', trigger: () => setModal({ type: 'resources' }) },
    { label: '火焰符', value: state.fire, icon: 'fire', className: 'coral', trigger: () => {
      if (!state.fire) { notify('火焰符用完，可在同步资源中修改。'); return }
      setSelected(null); setFireMode(!fireMode)
    } },
    { label: '冰冻符', value: state.ice, icon: 'ice', className: 'blue', trigger: () => setModal({ type: 'resources' }) },
  ] as const

  return <>
    <header className="topbar"><div className="top-inner">
      <div className="brand"><span className="brand-mark"><Icon name="wave" size={24}/></span><div><strong>走江踏浪</strong><span>疯狂水世界 · 战术工具</span></div></div>
      <nav aria-label="工作台工具">
        <button className="top-button snapshot-button" onClick={() => setModal({ type: 'screenshot' })}><Icon name="upload" size={17}/> <span>载入微信实局</span></button>
        <button className="top-button" onClick={() => setModal({ type: 'archive' })}><Icon name="archive" size={17}/> <span>存档</span></button>
        <button className="top-button" onClick={() => setModal({ type: 'rules' })}><Icon name="settings" size={17}/> <span>规则设置</span></button></nav>
    </div></header>
    <main className="shell">
      <section className="hero">
        <div className="eyebrow"><span className="hero-dash"/> TIDAL TACTICIAN <span className="hero-divider"/> 战术工作台</div>
        <h1>走江踏浪<span>推演器</span></h1>
        <p>同步真实棋盘，推演安全走法，守住最后一道防线。</p>
        <div className="hero-status"><span className="autosave"><i/> {storageOk ? '自动保存已开启' : '自动保存不可用'}</span>
          <span className="turn-label"><Icon name="clock" size={15}/> 第 {String(state.turn).padStart(2, '0')} 回合</span></div>
      </section>
      <div className="resource-grid">{resources.map(resource => <button key={resource.icon} className={`resource panel ${resource.className} ${resource.icon === 'fire' && fireMode ? 'active' : ''}`} onClick={resource.trigger}>
        <span className="resource-icon"><Icon name={resource.icon} size={21}/></span><span className="resource-text"><small>{resource.label}</small><strong>{resource.value.toLocaleString()}</strong></span>
      </button>)}</div>
      <div className="dashboard">
        <section className="workspace" aria-label="棋盘工作区">
          <div className="panel main-panel">
            <div className="board-toolbar">
              <div className="board-title"><Icon name="grid" size={18}/> <h2>局面棋盘</h2></div>
              <div className="toolbar-end">
                <div className="mode-switch" aria-label="棋盘模式">
                  <button aria-pressed={mode === 'play'} onClick={() => { setMode('play'); clearSelection() }}>推演</button>
                  <button aria-pressed={mode === 'edit'} onClick={() => { setMode('edit'); clearSelection() }}>编辑</button>
                </div>
                <div className="history-buttons">
                  <button className="icon-button" disabled={!history.past.length} onClick={() => travel('undo')} aria-label="撤销"><Icon name="undo" size={16}/></button>
                  <button className="icon-button" disabled={!history.future.length} onClick={() => travel('redo')} aria-label="重做"><Icon name="redo" size={16}/></button>
                </div>
              </div>
            </div>
            {fireMode && <div className="board-alert gold-hint">火焰符已选中，点僵尸格指定要清除的列。 <button className="text-button" onClick={() => setFireMode(false)}>取消</button></div>}
            {state.failed && <div className="board-alert danger-text">防线已失守。可撤销，或编辑僵尸格重新同步。</div>}
            {state.frozen > 0 && <div className="board-alert blue">僵尸冻结中，剩余 {state.frozen} 个正常回合。</div>}
            <Board state={state} mode={mode} selected={selected} fireMode={fireMode} preview={action && 'from' in action ? action : undefined}
              cellClick={index => fireMode ? perform({ kind: 'fire', col: colOf(index) }) : setModal({ type: 'enemy', index })}
              partnerClick={clickPartner} transfer={transfer} batch={() => setModal({ type: 'batch' })}/>
          </div>
          <div className="board-tools">
            <button className="subtle-button" onClick={() => setModal({ type: 'enemy', index: Math.max(0, state.enemies.findIndex(cell => !cell.length)) })}><Icon name="plus" size={16}/> 添加僵尸</button>
            <button className="subtle-button" onClick={() => setModal({ type: 'resources' })}><Icon name="edit" size={16}/> 同步资源</button>
            <button className="subtle-button" onClick={() => { clearSelection(); setFireMode(!fireMode) }} disabled={!state.fire || state.failed}><Icon name="fire" size={16}/> 使用火焰符</button>
            <button className="subtle-button" onClick={() => perform({ kind: 'ice' })} disabled={!state.ice || Boolean(state.frozen) || state.failed}><Icon name="ice" size={16}/> 使用冰冻符</button>
          </div>
          {lastLog.length > 0 && <div className="panel last-log"><strong>上次结算</strong><ul className="log-list">{lastLog.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        </section>
        <Analysis state={state} depth={depth} setDepth={value => { clearAnalysis(); setDepth(value) }} result={result} running={running} analyze={analyze}
          execute={() => { if (action) perform(action) }} preview={() => setModal({ type: 'preview' })}/>
      </div>
      <footer><span><Icon name="wave" size={16}/> 走江踏浪 · 玩家推演工作台</span><span>首次开启载入示例 · 棋盘数据保存在本机</span></footer>
    </main>
    {status && <div className="toast" role="status"><Icon name="info" size={17}/>{status}</div>}
    {modal?.type === 'enemy' && <EnemyEditor state={state} index={modal.index} close={close} save={(dest, enemies) => {
      const merged = dest === modal.index ? enemies : [...state.enemies[dest], ...enemies]
      if (merged.length > 64) return '目标格最多支持 64 个单位。'
      const cleared = dest === modal.index ? state : replaceCell(state, modal.index, [])
      update(replaceCell(cleared, dest, merged), '已同步僵尸格')
    }}/>}
    {modal?.type === 'partner' && <PartnerEditor title={`编辑${slotName(modal.slot)}`} partner={state[modal.slot.zone][modal.slot.index]}
      maxLevel={state.rules.maxLevel} close={close} save={partner => {
      const { zone, index } = modal.slot
      const slots = [...state[zone]]
      slots[index] = partner
      update({ ...state, [zone]: slots }, '已同步伙伴')
    }}/>}
    {modal?.type === 'batch' && <BatchEditor state={state} close={close} save={enemies => update({ ...state, enemies, failed: false }, '已覆盖僵尸区')}/>}
    {modal?.type === 'rules' && <RulesEditor state={state} close={close} save={next => update(next, '规则校准已保存')}/>}
    {modal?.type === 'resources' && <ResourcesEditor state={state} close={close} save={next => update(next, '已同步回合资源')}/>}
    {modal?.type === 'preview' && result?.action && <Preview state={state} result={result} close={close}/>}
    {modal?.type === 'archive' && <Dialog title="存档与手动同步" eyebrow="LOCAL ARCHIVE" close={close}>
      <p className="muted">当前局面会自动保存。手动存档是独立快照，读取、导入和重置均可撤销。</p>
      <div className="archive-grid">
        <button className="subtle-button" onClick={saveArchive}><Icon name="archive"/> 手动保存</button>
        <button className="subtle-button" onClick={loadArchive}><Icon name="redo"/> 读取存档</button>
        <button className="subtle-button" onClick={() => download(state)}><Icon name="download"/> 导出 JSON</button>
        <button className="subtle-button" onClick={() => file.current?.click()}><Icon name="upload"/> 导入 JSON</button>
        <button className="subtle-button" onClick={() => openSync(exportState(state))}><Icon name="code"/> 手动同步</button>
        <button className="subtle-button" onClick={copyText}><Icon name="copy"/> 复制局面文本</button>
      </div>
      <div className="dialog-actions"><button className="text-button danger-text" onClick={() => setModal({ type: 'reset' })}>重置局面</button></div>
    </Dialog>}
    {modal?.type === 'sync' && <Dialog title="手动同步完整局面" eyebrow="MANUAL SYNC" close={close} wide>
      <p className="muted">粘贴已导出的 JSON 可覆盖棋盘、规则和资源。文本框也支持手动选择并复制。</p>
      <label className="input-label">局面内容<textarea className="mono" rows={12} spellCheck={false} value={sync} onChange={event => setSync(event.target.value)}/></label>
      {syncError && <p className="danger-text" role="alert">{syncError}</p>}
      <div className="dialog-actions"><button className="primary" onClick={() => {
        try { update(importState(sync), '完整局面已同步') } catch (error) { setSyncError((error as Error).message) }
      }}>覆盖当前局面</button></div>
    </Dialog>}
    {modal?.type === 'reset' && <Dialog title="重置当前局面" eyebrow="RESET BOARD" close={close}>
      <p className="muted">可载入示例，或从空棋盘同步真实游戏。重置后可以撤销。</p>
      <div className="dialog-actions"><button className="subtle-button" onClick={() => update(demoState(), '已载入示例')}>载入示例</button>
        <button className="subtle-button" onClick={() => setModal({ type: 'wechat' })}>载入微信实局</button>
        <button className="primary" onClick={() => { update(emptyState(state.rules), '已建立空棋盘'); setMode('edit') }}>清空棋盘</button></div>
    </Dialog>}
    {modal?.type === 'wechat' && <Dialog title="载入微信实局" eyebrow="WECHAT SNAPSHOT" close={close}>
      <p className="muted">载入之前记录的 4535 分、83 瓶饮料的微信棋盘。载入会替换当前棋盘，可用「撤销」恢复。</p>
      <p className="hint">初始血量暂用画面上的当前血量代填，可手动校准。</p>
      <div className="dialog-actions">
        <button className="subtle-button" onClick={close}>取消</button>
        <button className="primary" onClick={() => { update(wechatSample(), '已载入微信实局快照'); setMode('play') }}>确认载入</button>
      </div>
    </Dialog>}
    {modal?.type === 'screenshot' && <ScreenshotImport file={screenshot} state={state} selectFile={setScreenshot} close={close}
      sample={() => { setScreenshot(null); setModal({ type: 'wechat' }) }}
      save={next => { update(next, '已载入截图棋盘，可撤销'); setMode('play') }}/>}
    <input ref={file} hidden type="file" accept="application/json,.json" onChange={async event => {
      const input = event.currentTarget
      const selectedFile = input.files?.[0]
      input.value = ''
      if (!selectedFile) return
      try { update(importState(await selectedFile.text()), '已导入 JSON 存档') }
      catch (error) { close(); notify(`导入失败：${(error as Error).message}`) }
    }}/>
  </>
}
