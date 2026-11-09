import { useEffect, useRef, useState } from 'react'
import { Dialog } from './Editors'
import { canRecognizeScreenshots, ocrPath, readScreenshot, screenshotResources, screenshotState } from './game/screenshot'
import type { ScreenshotDraft } from './game/screenshot'
import type { State } from './game/model'

async function recognize(file: File, signal: AbortSignal) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  try {
    const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('当前浏览器无法读取截图。')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('无法读取这张图片，请重新截图。')

    const response = await fetch(ocrPath, { method: 'POST', body: png, signal })
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('当前服务没有启动截图识别。请在 Mac 上停止旧服务，再双击「启动推演器.command」。')
    }
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? '截图识别失败。')
    return readScreenshot(result, context.getImageData(0, 0, canvas.width, canvas.height))
  } finally {
    bitmap.close()
  }
}

export function ScreenshotImport({ file, state, selectFile, save, sample, close }: {
  file: File | null; state: State; selectFile: (file: File) => void
  save: (state: State) => void; sample: () => void; close: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<ScreenshotDraft | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file) return
    const source = URL.createObjectURL(file)
    const controller = new AbortController()
    setPreview(source)
    setBusy(true)
    setDraft(null)
    setError('')
    recognize(file, controller.signal).then(result => {
      if (!controller.signal.aborted) setDraft(result)
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '截图识别失败。')
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false)
    })
    return () => {
      controller.abort()
      URL.revokeObjectURL(source)
    }
  }, [file])

  return <Dialog title="载入微信实局" eyebrow="WECHAT SCREENSHOT" close={close} wide>
    {canRecognizeScreenshots
      ? <p className="muted">截取完整的游戏对局画面，保留棋盘、顶部积分和底部休息区及符咒。在这里按 ⌘V 或 Ctrl+V 粘贴，图片由本机识别。</p>
      : <p className="hint">截图识别在 Mac 本地版运行。可在本地识别后导出 JSON，再回到这里通过「存档」导入。</p>}
    <div className="dialog-actions screenshot-actions">
      {canRecognizeScreenshots && <button className="subtle-button" onClick={() => input.current?.click()}>选择截图</button>}
      <button className="text-button" onClick={sample}>载入之前的 4535 分快照</button>
    </div>
    <input ref={input} type="file" accept="image/*" hidden onChange={event => {
      const image = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (image) selectFile(image)
    }}/>
    {busy && <p className="hint" role="status">正在识别截图，首次识别可能需要几秒。</p>}
    {error && <p className="hint danger-text" role="alert">{error}</p>}
    <div className={draft ? 'screenshot-review' : undefined}>
      {preview && <img className="screenshot-preview" src={preview} alt="待核对的微信棋盘截图"/>}
      {draft && <form onSubmit={event => {
        event.preventDefault()
        try { save(screenshotState(draft, state)) }
        catch (failure) { setError((failure as Error).message) }
      }}>
        <p className="hint">请对照原图核对。问号和空白资源需要补齐。初始血量暂按当前值，回合数和剩余冻结回合从 0 起算。</p>
        <label className="input-label">邪祟区（6 排 × 5 列）
          <textarea rows={6} spellCheck={false} value={draft.enemies} onChange={event => setDraft({ ...draft, enemies: event.target.value })}/>
        </label>
        <p className="muted small">空格填「.」，邪祟填血量，大型邪祟在左下格填 L 加血量，密卷填 B，血瓷瓶填 R。</p>
        <label className="input-label">上阵区（2 排 × 5 列）
          <textarea rows={2} spellCheck={false} value={draft.field} onChange={event => setDraft({ ...draft, field: event.target.value })}/>
        </label>
        <label className="input-label">休息区（按已解锁格数填写）
          <input value={draft.bench} onChange={event => setDraft({ ...draft, bench: event.target.value })}/>
        </label>
        <p className="muted small">伙伴填「李」或「秦」加攻击力，例如「李8」「秦2」。每格用空格隔开，空格填「.」。</p>
        <div className="form-grid">{(Object.keys(screenshotResources) as (keyof typeof screenshotResources)[]).map(key =>
          <label className="input-label" key={key}>{screenshotResources[key]}
            <input inputMode="numeric" value={draft.resources[key]} onChange={event =>
              setDraft({ ...draft, resources: { ...draft.resources, [key]: event.target.value } })}/>
          </label>)}</div>
        <div className="dialog-actions"><button className="primary" type="submit">确认载入截图</button></div>
      </form>}
    </div>
  </Dialog>
}
