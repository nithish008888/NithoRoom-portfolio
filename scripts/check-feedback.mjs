// Captures hover feedback (tape) and keyboard focus (Tab to desk objects).
// node scripts/check-feedback.mjs <outPrefix> [baseUrl]
import { chromium } from 'playwright'

const [prefix, base = 'http://127.0.0.1:4810/'] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(base)
await page.waitForFunction(() => window.__room?.store.getState().phase === 'ready', null, { timeout: 120000 })
await page.evaluate(() => [...document.querySelectorAll('.entry .hit')][1].click())
await page.waitForTimeout(3500)
const p = await page.evaluate(() => window.__room.screenOf('Tape:escrochain', true))
await page.mouse.move(p.x - 40, p.y + 30, { steps: 5 })
await page.mouse.move(p.x, p.y, { steps: 10 })
await page.waitForTimeout(600)
await page.screenshot({ path: `${prefix}_hover.png` })
console.log('hover:', await page.evaluate(() => window.__room.store.getState().hover))
// keyboard: move the mouse away, tab into the desk objects
await page.mouse.move(5, 450)
await page.keyboard.press('Tab')
let label = ''
for (let i = 0; i < 12; i++) {
  label = await page.evaluate(() => document.activeElement?.textContent ?? '')
  if (/notepad/i.test(label)) break
  await page.keyboard.press('Tab')
}
await page.waitForTimeout(400)
await page.screenshot({ path: `${prefix}_focus.png` })
console.log('focused:', label)
await page.keyboard.press('Enter')
await page.waitForTimeout(2200)
console.log('after Enter view:', await page.evaluate(() => window.__room.store.getState().view))
await browser.close()
