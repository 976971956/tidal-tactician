import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { preview } from 'vite'

async function loadDemo(page: Page) {
  await page.getByRole('button', { name: '存档', exact: true }).click()
  await page.getByRole('button', { name: '重置局面' }).click()
  await page.getByRole('button', { name: '载入示例' }).click()
}

test('完整棋盘可见，触摸灰格可编辑和保存僵尸', async ({ page }, info) => {
  await page.goto('/')
  const enemy = page.getByRole('button', { name: /僵尸区 1 排 1 列/ })
  await expect(page.getByRole('button', { name: /^僵尸区 .*空格$/ })).toHaveCount(30)
  await expect(page.getByRole('button', { name: /^伙伴区 .*空格$/ })).toHaveCount(10)
  await expect(page.getByRole('button', { name: /^休息区.*空格$/ })).toHaveCount(2)
  await expect(page.locator('[data-slot="field:9"]')).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  if (info.project.use.hasTouch) await enemy.tap()
  else await enemy.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toHaveText('编辑僵尸格 · 1 排 1 列')
  await dialog.getByLabel('当前血量').fill('5')
  await dialog.getByLabel('初始血量').fill('23')
  await dialog.getByRole('button', { name: '保存格子' }).click()
  await expect(enemy).toHaveAccessibleName(/普通僵尸 5 血/)
  await expect(page.getByText('第 00 回合')).toBeVisible()
  await page.reload()
  await expect(enemy).toHaveAccessibleName(/普通僵尸 5 血/)
})

test('第一排的大型邪祟向上占格，保留第二排原有僵尸', async ({ page }) => {
  await page.goto('/')
  const dialog = page.getByRole('dialog')
  const secondRow = page.locator('[data-enemy="8"]')
  await secondRow.click()
  await dialog.getByLabel('当前血量').fill('9')
  await dialog.getByRole('button', { name: '保存格子' }).click()
  await page.getByRole('button', { name: /僵尸区 1 排 5 列：空格/ }).click()
  await dialog.getByLabel('类型').selectOption('large')
  await dialog.getByLabel('当前血量').fill('17')
  await dialog.getByRole('button', { name: '保存格子' }).click()
  await expect(dialog.getByRole('alert')).toContainText('第 1–4 列')
  await dialog.getByLabel('目标列').selectOption('4')
  await dialog.getByRole('button', { name: '保存格子' }).click()
  await expect(page.getByRole('button', { name: /僵尸区 1 排 4 列：大型邪祟 17 血/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /僵尸区 1 排 5 列：大型邪祟占格/ })).toBeVisible()
  await expect(secondRow).toHaveAccessibleName(/普通僵尸 9 血/)
  await expect(secondRow).not.toHaveClass(/large-tile/)
  await expect(page.locator('[data-enemy].large-tile')).toHaveCount(2)
  const outside = page.getByRole('group', { name: '大型邪祟的棋盘外占位' }).getByText('棋盘外', { exact: true })
  await expect(outside).toHaveCount(2)
  await page.reload()
  await expect(outside).toHaveCount(2)
  await expect(secondRow).toHaveAccessibleName(/普通僵尸 9 血/)
})

test('清空僵尸区保留伙伴和资源，刷新后仍可撤销', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '载入微信实局' }).click()
  await page.getByRole('button', { name: '载入之前的 4535 分快照' }).click()
  await page.getByRole('button', { name: '确认载入' }).click()
  const clear = page.getByRole('button', { name: '清空僵尸区' })
  const emptyCells = page.getByRole('button', { name: /^僵尸区 .*空格$/ })
  await expect(page.getByRole('button', { name: /追远密卷 1 血/ })).toBeVisible()
  await clear.click()
  await expect(emptyCells).toHaveCount(30)
  await expect(clear).toBeDisabled()
  await expect(page.getByRole('button', { name: /伙伴区 1 排 2 列.*李追远 攻击力 16/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /休息区第 1 格.*秦璃 攻击力 1/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /饮料\s*83/ })).toBeVisible()
  await expect(page.getByText('第 00 回合')).toBeVisible()
  await page.reload()
  await expect(emptyCells).toHaveCount(30)
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByRole('button', { name: /追远密卷 1 血/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /大型邪祟 71 血/ })).toBeVisible()
  await expect(clear).toBeEnabled()
})

test('执行唯一推荐并撤销、重做', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await loadDemo(page)
  await page.getByRole('button', { name: '分析下一步' }).click()
  await expect(page.getByRole('button', { name: '执行推荐操作' })).toBeVisible()
  await expect(page.locator('.move-arrow')).toBeVisible()
  await page.getByRole('button', { name: '只预览，不执行' }).click()
  await expect(page.getByText('操作前', { exact: true })).toBeVisible()
  await expect(page.getByText('操作后', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByText('第 00 回合')).toBeVisible()
  await page.getByRole('button', { name: '执行推荐操作' }).click()
  await expect(page.getByText('第 01 回合')).toBeVisible()
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByText('第 00 回合')).toBeVisible()
  await page.getByRole('button', { name: '重做' }).click()
  await expect(page.getByText('第 01 回合')).toBeVisible()
  expect(errors).toEqual([])
})

test('先点伙伴后点目标，完成两回合并还原手动存档', async ({ page }, info) => {
  await page.goto('/')
  await loadDemo(page)
  const press = async (slot: string) => {
    const locator = page.locator(`[data-slot="${slot}"]`)
    if (info.project.use.hasTouch) await locator.tap()
    else await locator.click()
  }
  await page.getByRole('button', { name: '存档', exact: true }).click()
  await page.getByRole('button', { name: '手动保存' }).click()
  await press('field:5')
  await expect(page.locator('[data-slot="field:5"]')).toHaveAttribute('aria-pressed', 'true')
  await press('field:6')
  await expect(page.getByText('第 01 回合')).toBeVisible()
  await press('bench:0')
  await press('field:7')
  await expect(page.getByText('第 02 回合')).toBeVisible()
  await page.getByRole('button', { name: '存档', exact: true }).click()
  await page.getByRole('button', { name: '读取存档' }).click()
  await expect(page.getByText('第 00 回合')).toBeVisible()
})

test('微信实局显示四个占格，并只找到一回合的冰冻缓冲', async ({ page }) => {
  await page.goto('/')
  const load = page.getByRole('button', { name: '载入微信实局' })
  await expect(load).toBeInViewport({ ratio: 1 })
  await load.click()
  await page.getByRole('button', { name: '载入之前的 4535 分快照' }).click()
  await page.getByRole('button', { name: '确认载入' }).click()
  await expect(page.locator('[data-enemy].large-tile')).toHaveCount(4)
  await expect(page.getByRole('button', { name: /大型邪祟 71 血/ })).toHaveCount(1)
  await page.getByRole('button', { name: /5 排 4 列：大型邪祟占格/ }).click()
  await expect(page.getByRole('dialog').getByRole('heading')).toHaveText('编辑僵尸格 · 6 排 3 列')
  await page.getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: '分析下一步' }).click()
  await expect(page.getByText('仅找到短期安全操作')).toBeVisible()
  await expect(page.getByText(/1 个正常回合经模拟存活/)).toBeVisible()
})

test.describe('截图载入', () => {
  test.use({ serviceWorkers: 'block' })

  test('识别后先校对，确认载入后可撤销', async ({ page, browserName }) => {
    await page.route('**/__tidal/ocr', route => route.fulfill({ json: {
      width: 598, height: 1148,
      tokens: [
        ['本局积分', 251, 134], ['休息区', 298, 987], ['4535', 370, 134], ['83', 82, 134],
        ['19', 171, 233], ['71', 359, 678], ['16', 218, 802], ['0/1', 543, 1034], ['1/1', 543, 1120],
      ].map(([text, x, y]) => ({ text, x, y, width: 20, height: 14 })),
    } }))
    await page.goto('/')
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 598
      canvas.height = 1148
      return canvas.toDataURL('image/png')
    })
    if (browserName === 'webkit') {
      await page.getByRole('button', { name: '载入微信实局' }).click()
      await page.locator('dialog input[type=file]').setInputFiles({
        name: 'screenshot.png', mimeType: 'image/png', buffer: Buffer.from(image.split(',')[1], 'base64'),
      })
    } else {
      await page.evaluate(async data => {
        const blob = await (await fetch(data)).blob()
        const clipboardData = new DataTransfer()
        clipboardData.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }))
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true }))
      }, image)
    }
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('积分', { exact: true })).toHaveValue('4535')
    await expect(dialog.getByLabel('邪祟区', { exact: false })).toHaveValue(/^L19 /)
    await expect(dialog.getByLabel('邪祟区', { exact: false })).toHaveValue(/L71/)
    await dialog.getByRole('button', { name: '确认载入截图' }).click()
    await expect(dialog.getByRole('alert')).toContainText('需要核对')
    await dialog.getByLabel('上阵区', { exact: false }).fill('. 李16 . . .\n. . . . .')
    await dialog.getByRole('button', { name: '确认载入截图' }).click()
    await expect(page.getByRole('button', { name: /僵尸区 1 排 1 列：大型邪祟 19 血/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /大型邪祟 71 血/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /伙伴区 1 排 2 列.*李追远 攻击力 16/ })).toBeVisible()
    await page.getByRole('button', { name: '撤销' }).click()
    await expect(page.getByRole('button', { name: /大型邪祟 71 血/ })).toHaveCount(0)
  })
})

test('联网时打开最新版首页，静态服务停止后仍可推演', async ({ page }) => {
  let updated = false
  const server = await preview({
    preview: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'updated-homepage',
      configurePreviewServer({ middlewares }) {
        middlewares.use((request, response, next) => {
          if (!updated || request.url !== '/') return next()
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end('<!doctype html><title>推演器新版首页</title>')
        })
      },
    }],
  })
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('离线测试服务未启动')
  const url = 'http://127.0.0.1:' + address.port + '/'
  try {
    await page.goto(url)
    await loadDemo(page)
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    updated = true
    await page.reload()
    await expect(page).toHaveTitle('推演器新版首页')
  } finally {
    await server.close()
  }
  await expect(fetch(url)).rejects.toThrow()
  await page.reload()
  await page.getByRole('button', { name: '分析下一步' }).click()
  await expect(page.getByRole('button', { name: '执行推荐操作' })).toBeVisible()
})
