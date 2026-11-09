import { Icon, Radar } from './Art'
import { MiniBoard } from './Board'
import { Dialog } from './Editors'
import { simulate } from './game/combat'
import { colOf, describe, rowOf } from './game/model'
import type { State } from './game/model'
import { risk } from './game/search'
import type { Recommendation } from './game/search'

export function Analysis({ state, depth, setDepth, result, running, analyze, execute, preview }: {
  state: State; depth: number; setDepth: (depth: number) => void; result: Recommendation | null
  running: boolean; analyze: () => void; execute: () => void; preview: () => void
}) {
  const outcome = result?.action ? simulate(state, result.action) : null
  const currentRisk = risk(state)
  const nextRisk = outcome ? risk(outcome.state) : null
  const status = result && ({
    clear: '已知僵尸可清场', safe: '搜索深度内有安全解', limited: '仅找到短期安全操作',
    impossible: state.failed ? '当前局面已失败' : result.pruned ? '搜索范围内未找到安全操作' : '当前无安全操作',
    stalled: '缺少可推进回合的操作',
  })[result.status]
  return <aside className="sidebar">
    <section className="panel analysis">
      <div className="analysis-head"><span className="analysis-icon"><Icon name="target" size={20}/></span>
        <div><div className="eyebrow">TACTICAL ANALYSIS</div><h2>战术推演</h2></div>
        <span className="engine-tag"><i/> 推演引擎</span>
      </div>
      <div className="analysis-body">
        <div className="depth-row"><label htmlFor="depth">搜索深度</label>
          <select id="depth" value={depth} onChange={event => setDepth(Number(event.target.value))}>
            {[3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} 回合</option>)}</select></div>
        {result ? <div className="analysis-result" aria-live="polite">
          <span className={`status-pill ${['clear', 'safe'].includes(result.status) ? 'success' : 'attention'}`}>{status}</span>
          {result.action && outcome ? <>
            <h3>{describe(state, result.action)}</h3>
            <div className="result-line"><Icon name="shield" size={16}/> {result.survived} 个正常回合经模拟存活 · {result.rescue ? '路线需要符咒' : '路线无需符咒'}</div>
            <div className="result-line"><Icon name="skull" size={16}/> 本步击杀 {outcome.killed} 只 · 总有效伤害 {outcome.hits.reduce((sum, hit) => sum + hit.damage, 0)} · 积分 +{outcome.state.score - state.score}</div>
            <div className="result-line"><Icon name="target" size={16}/> 下一回合末排威胁 {nextRisk!.bottom} 只
              {outcome.state.frozen > 0 && ` · 已冻结 ${outcome.state.frozen} 回合`}</div>
            <p className="muted small">可信度：{result.pruned ? '有限搜索内已复演' : '搜索范围内已复演'} · 模拟 {result.searched.toLocaleString()} 种走法</p>
            {result.rescue && result.normalPruned && <p className="hint gold-hint">常规搜索经过剪枝，当前范围内未找到满足目标的无符路线。</p>}
            <button className="primary full" onClick={execute}><Icon name="play" size={17}/> 执行推荐操作</button>
            <button className="subtle-button full preview-button" onClick={preview}>只预览，不执行<Icon name="chevron" size={15}/></button>
          </> : <p className="muted">{result.status === 'clear' ? '当前僵尸区已清空，可以同步真实游戏的新局面。' : result.status === 'stalled' ? '检查饮料和伙伴布局，或编辑棋盘以继续推演。' : '可以同步局面、校准规则，或撤销到先前回合。'}</p>}
        </div> : <div className="analysis-empty" aria-live="polite">
          <Radar/>
          <h3>{running ? '正在推演多回合…' : '等待分析当前局面'}</h3>
          <p>{running ? '正在尝试移动、交换与合成' : '搜索安全走法，给出唯一下一步'}</p>
        </div>}
        {(!result || !outcome) && <button className="primary full analyze-button" onClick={analyze} disabled={running}>
          <Icon name="target" size={19}/>{running ? '推演中…' : '分析下一步'}<Icon name="arrow" size={17}/>
        </button>}
        <p className="analysis-foot"><Icon name="info" size={14}/> 仅推演已知局面，未来刷新需手动同步。</p>
      </div>
    </section>
    <section className="panel threat-panel">
      <div className="threat-head"><div className="section-label"><span className="section-icon coral"><Icon name="shield" size={15}/></span><h2>防线监控</h2></div>
        <span className={`status-pill ${state.failed || currentRisk.bottom ? 'attention' : 'success'}`}>{state.failed ? '防线失守' : currentRisk.bottom ? '底线告急' : '监控中'}</span></div>
      <div className="threat-stats"><div><strong>{currentRisk.count}</strong><span>场上僵尸</span></div><div><strong className={currentRisk.bottom ? 'danger-text' : ''}>{currentRisk.bottom}</strong><span>末排威胁</span></div>
        <div><strong>{currentRisk.output.filter(Boolean).length}<small> / 5</small></strong><span>攻击覆盖</span></div></div>
    </section>
    <div className="field-guide">
      <div><span className="guide-icon"><Icon name="edit" size={15}/></span><p><strong>同步真实局面</strong><small>点灰格编辑，或一次覆盖整块僵尸区。</small></p></div>
      <div><span className="guide-icon"><Icon name="play" size={15}/></span><p><strong>连续回合推演</strong><small>先点伙伴，再点目标格。每步消耗 1 瓶饮料。</small></p></div>
    </div>
  </aside>
}

export function Preview({ state, result, close }: { state: State; result: Recommendation; close: () => void }) {
  const action = result.action!
  const outcome = simulate(state, action)!
  let cursor = state
  return <Dialog title="推荐操作预览" eyebrow="TACTICAL REPLAY" close={close} wide>
    <p className="hint">{describe(state, action)} · 搜索深度 {result.depth} 回合</p>
    <div className="preview-boards"><MiniBoard state={state} caption="操作前"/><MiniBoard state={outcome.state} caption="操作后"/></div>
    <p className="muted small">饮料 {state.drinks} → {outcome.state.drinks}　积分 {state.score} → {outcome.state.score}　休息区剩余 {outcome.state.bench.filter(item => !item).length} 格</p>
    <h3>伤害与击杀</h3>
    {outcome.hits.length ? <ul className="log-list">{outcome.hits.map((hit, index) => <li key={index}>
      第 {rowOf(hit.index) + 1} 排第 {colOf(hit.index) + 1} 列 · {hit.name} · {hit.before} → {hit.after} 血 {hit.killed && '（清除）'}
    </li>)}</ul> : <p className="muted">本步无伤害。</p>}
    {outcome.notes.map((note, index) => <p className="hint" key={index}>{note}</p>)}
    <h3>已复演路线</h3>
    <ol className="log-list">{result.path.map((step, index) => {
      const label = describe(cursor, step)
      cursor = simulate(cursor, step)!.state
      return <li key={index}>{label}</li>
    })}</ol>
    <p className="muted small">预览结算当前棋盘。实战首排刷出新邪祟或道具后，请同步新棋盘再继续推演。</p>
  </Dialog>
}
