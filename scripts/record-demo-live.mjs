// Records the interaction demo in real time (Playwright video, WebM) with the dev/preview server running.
// Quick and needs no ffmpeg, but animations stutter if the machine is busy; for the smooth,
// frame-by-frame version use scripts/record-demo.mjs.
// node scripts/record-demo-live.mjs [baseUrl]   -> docs/demo/demo-live.webm
import { chromium } from 'playwright'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.argv[2] ?? 'http://127.0.0.1:4810/'
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'demo')
const tmp = join(out, 'tmp')
await mkdir(tmp, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: tmp, size: { width: 1280, height: 720 } },
})
const page = await ctx.newPage()
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__room?.store.getState().phase === 'ready', null, { timeout: 120000 })

const wait = (ms) => page.waitForTimeout(ms)
// tapes are aimed at their spine (front face), everything else at its centre
const at = (name) => page.evaluate((n) => window.__room.screenOf(n, n.startsWith('Tape:')), name)
async function glide(name, steps = 25) {
  const p = await at(name)
  if (p) await page.mouse.move(p.x, p.y, { steps })
  return p
}

// entry
await wait(1200)
const entry = await page.evaluate(() => {
  const r = document.querySelectorAll('.entry .hit')[1]?.getBoundingClientRect()
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
})
if (entry) {
  await page.mouse.move(entry.x, entry.y - 60, { steps: 10 })
  await page.mouse.move(entry.x, entry.y, { steps: 12 })
  await wait(400)
  await page.mouse.click(entry.x, entry.y)
}
await wait(3400)
// look around the desk, then pick up the notepad
await glide('TV_Shell')
await wait(700)
await glide('Tape:escrochain')
await wait(900)
await glide('Notepad')
await wait(600)
const pad = await at('Notepad')
if (pad) await page.mouse.click(pad.x, pad.y)
await wait(2400)
// play a tape from the stack
await glide('Tape:escrochain', 30)
await wait(600)
const tape = await at('Tape:escrochain')
if (tape) await page.mouse.click(tape.x, tape.y)
await wait(5200)
// then pick another one from the notepad list
const row = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.page .hit')].find((x) => /Hemodialysis/i.test(x.textContent ?? ''))
  const r = b?.getBoundingClientRect()
  return r ? { x: r.x + Math.min(r.width / 3, 220), y: r.y + r.height / 2 } : null
})
if (row) {
  await page.mouse.move(row.x, row.y, { steps: 30 })
  await wait(700)
  await page.mouse.click(row.x, row.y)
}
await wait(5600)
// put the notepad down
await page.keyboard.press('Escape')
await wait(2400)
// about: the old computer
await page.keyboard.press('a')
await wait(3600)
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('ArrowDown')
  await wait(180)
}
await wait(900)
await page.keyboard.press('Escape')
await wait(2200)
// résumé, contact, music
await page.keyboard.press('r')
await wait(3000)
await page.keyboard.press('c')
await wait(3000)
await page.keyboard.press('m')
await wait(3000)
await page.keyboard.press('Escape')
await wait(2600)

await ctx.close()
await browser.close()
const files = (await readdir(tmp)).filter((f) => f.endsWith('.webm'))
if (files[0]) await rename(join(tmp, files[0]), join(out, 'demo-live.webm'))
await rm(tmp, { recursive: true, force: true })
console.log('saved', join(out, 'demo-live.webm'))
