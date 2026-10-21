// Desktop + mobile screenshots of the main views.
// Needs the dev server (npm run dev) or a preview server running.
// node scripts/screenshots.mjs [baseUrl]   (default http://127.0.0.1:4810/)
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.argv[2] ?? 'http://127.0.0.1:4810/'
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots')
await mkdir(out, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})

async function session(name, contextOpts, plan) {
  const ctx = await browser.newContext(contextOpts)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message))
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__room?.store.getState().phase === 'ready', null, { timeout: 120000 })
  await page.waitForTimeout(900)
  const shot = async (label) => {
    const file = join(out, `${name}-${label}.png`)
    await page.screenshot({ path: file })
    console.log('saved', file)
  }
  await plan(page, shot)
  await ctx.close()
}

const go = (page, hash) => page.evaluate((h) => (location.hash = h), hash)
const enter = (page) => page.evaluate(() => [...document.querySelectorAll('.entry .hit')][1]?.click())

const plan = async (page, shot) => {
  await shot('01-entry')
  await enter(page)
  await page.waitForTimeout(3600)
  await shot('02-overview')
  await go(page, '#/work')
  await page.waitForTimeout(2300)
  await shot('03-work-notepad')
  await go(page, '#/work/hemodialysis-vr')
  await page.waitForTimeout(950)
  await shot('04-tape-loading')
  await page.waitForTimeout(3600)
  await shot('05-tape-playing')
  await go(page, '#/about')
  await page.waitForTimeout(3400)
  await shot('06-about-terminal')
  await go(page, '#/resume')
  await page.waitForTimeout(2600)
  await shot('07-resume')
  await go(page, '#/contact')
  await page.waitForTimeout(2600)
  await shot('08-contact')
  await go(page, '#/music')
  await page.waitForTimeout(2600)
  await shot('09-music')
  await go(page, '#/tv')
  await page.waitForTimeout(2400)
  await shot('10-tv')
  // the switch above the computer turns on the tube light
  await go(page, '#/about')
  await page.waitForTimeout(3000)
  await page.evaluate(() => window.__room.lighting.toggleTube(true))
  await page.waitForTimeout(2500)
  await shot('12-about-light-on')
  await go(page, '#/')
  await page.waitForTimeout(3200)
  await shot('13-overview-light-on')
}

await session('desktop', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, plan)
await session('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, plan)

// reading version (desktop + mobile)
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await page.goto(base + '?reading', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(out, `${name}-11-reading.png`), fullPage: false })
  console.log('saved reading', name)
  await ctx.close()
}
await browser.close()
