// Development helper: open the site in (installed) Chrome with GPU, run steps, save screenshots.
// node scripts/dev-shot.mjs <url> <outPrefix> <width> <height> [steps...]
// steps: wait:<ms> | ready | settle | enter | enter:sound | key:<Key> | click:<selector> | view:<view> | project:<id>
//        | shot:<name> | mouse:<x>,<y> | clickat:<x>,<y> | eval:<js>
import { chromium } from 'playwright'

const [url, prefix = 'shot', w = '1920', h = '1080', ...steps] = process.argv.slice(2)
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const ctx = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: +(process.env.DPR || 1),
  isMobile: process.env.MOBILE === '1',
  hasTouch: process.env.MOBILE === '1',
  reducedMotion: process.env.REDUCED === '1' ? 'reduce' : 'no-preference',
})
const page = await ctx.newPage()
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' || m.type() === 'warning' || t.includes('[room]')) console.log(`[${m.type()}]`, t.slice(0, 400))
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const t0 = Date.now()
await page.goto(url, { waitUntil: 'domcontentloaded' })
const state = () => page.evaluate(() => window.__room?.store.getState())
for (const s of steps) {
  const [cmd, ...rest] = s.split(':')
  const arg = rest.join(':')
  if (cmd === 'wait') await page.waitForTimeout(+arg)
  else if (cmd === 'ready') {
    await page.waitForFunction(() => window.__room?.store.getState().phase === 'ready', null, { timeout: 120000 })
    console.log('ready after', Date.now() - t0, 'ms')
  } else if (cmd === 'settle') {
    // camera and tapes at rest (animations slow down when the GPU is busy)
    await page.waitForTimeout(300)
    await page.waitForFunction(() => !window.__room.store.getState().moving, null, { timeout: 90000 })
  } else if (cmd === 'enter') {
    await page.evaluate((snd) => {
      const b = [...document.querySelectorAll('.entry .hit')][snd ? 0 : 1]
      b?.click()
    }, arg === 'sound')
  } else if (cmd === 'key') await page.keyboard.press(arg)
  else if (cmd === 'click') await page.click(arg)
  else if (cmd === 'view') await page.evaluate((v) => (location.hash = v === 'overview' ? '#/' : `#/${v}`), arg)
  else if (cmd === 'project') await page.evaluate((p) => (location.hash = `#/work/${p}`), arg)
  else if (cmd === 'mouse') {
    const [x, y] = arg.split(',').map(Number)
    await page.mouse.move(x, y)
  } else if (cmd === 'clickat') {
    const [x, y] = arg.split(',').map(Number)
    await page.mouse.click(x, y)
  } else if (cmd === 'eval') console.log('eval:', await page.evaluate(arg))
  else if (cmd === 'shot') {
    await page.screenshot({ path: `${prefix}_${arg}.png` })
    const st = await state()
    console.log('shot', arg, st ? `phase=${st.phase} view=${st.view} project=${st.project} vcr=${st.vcr.status}/${st.vcr.tape}` : '')
  }
}
await browser.close()
