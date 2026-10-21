// Renders the interaction demo frame by frame on a virtual clock (Playwright's fake timers drive
// requestAnimationFrame and performance.now), so the video is smooth however busy the machine is.
// A small cursor is drawn into the page so viewers can follow the pointer.
//
// node scripts/record-demo.mjs [baseUrl] [--webm]   (dev or preview server running)
//   -> docs/demo/demo.mp4 (+ demo.webm with --webm). Encodes with ffmpeg: on PATH, or FFMPEG=/path/to/ffmpeg.
// For a quick real-time recording without ffmpeg see scripts/record-demo-live.mjs.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const base = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:4810/'
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'demo')
await mkdir(out, { recursive: true })
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const FPS = 30
const W = 1280
const H = 720

function run(argv, stdin = 'ignore') {
  const p = spawn(FFMPEG, ['-y', '-loglevel', 'error', ...argv], { stdio: [stdin, 'inherit', 'inherit'] })
  const done = new Promise((res, rej) => {
    p.on('error', (e) => rej(new Error(`could not start ffmpeg (${FFMPEG}): ${e.message}`)))
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`))))
  })
  return { p, done }
}

const mp4 = join(out, 'demo.mp4')
const enc = run(
  ['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
  'pipe',
)
const write = (buf) => new Promise((res) => (enc.p.stdin.write(buf) ? res() : enc.p.stdin.once('drain', res)))

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const ctx = await browser.newContext({ viewport: { width: W, height: H } })

// demo cursor: arrow, hand over anything clickable, a ring on press (animated on the page's own clock)
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const arrow =
      '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M4 2.5v17.2l4.6-4.3 3.1 7 2.9-1.3-3.1-6.9h6.4z" fill="#fff" stroke="#15151a" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    const hand =
      '<svg width="26" height="26" viewBox="0 0 26 26" style="transform:translate(-7px,-1px)"><path d="M9.5 12V4.6a1.6 1.6 0 0 1 3.2 0V11l.1-1.6a1.6 1.6 0 0 1 3.2.2l-.1 1.8.2-.9a1.6 1.6 0 0 1 3.1.6l-.2 1.4.3-.4a1.5 1.5 0 0 1 2.6 1.3l-1 4.6c-.6 2.8-2.8 4.9-5.8 4.9h-1.6c-2 0-3.8-1-4.9-2.6l-3.4-5a1.5 1.5 0 0 1 2.3-1.9z" fill="#fff" stroke="#15151a" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    const c = document.createElement('div')
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-99px,-99px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))'
    c.innerHTML = arrow
    const ring = document.createElement('div')
    ring.style.cssText = 'position:fixed;left:-18px;top:-18px;width:36px;height:36px;border-radius:50%;border:2px solid rgba(255,255,255,.9);z-index:2147483646;pointer-events:none;opacity:0'
    document.body.append(ring, c)
    let mode = 'arrow'
    let x = -99
    let y = -99
    const sync = () => {
      const el = document.elementFromPoint(x, y)
      const want = el && getComputedStyle(el).cursor === 'pointer' ? 'hand' : 'arrow'
      if (want !== mode) c.innerHTML = (mode = want) === 'hand' ? hand : arrow
    }
    window.__demoCursorSync = sync
    addEventListener('pointermove', (e) => {
      x = e.clientX
      y = e.clientY
      c.style.transform = `translate(${x}px,${y}px)`
      sync()
    })
    addEventListener('pointerdown', (e) => {
      const t0 = performance.now()
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 450)
        ring.style.transform = `translate(${e.clientX}px,${e.clientY}px) scale(${0.4 + k * 0.9})`
        ring.style.opacity = String(0.9 * (1 - k))
        if (k < 1) requestAnimationFrame(step)
      }
      step()
    })
  })
})

const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
// a cold, throttled load so the progress bar on the CRT has something to show
const cdp = await ctx.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: (24e6 / 8) | 0, uploadThroughput: 1e6 })
// install() alone keeps the fake clock running in real time; paused, it only moves in frame()
await page.clock.install()
await page.clock.pauseAt(Date.now() + 1000)
await page.goto(base, { waitUntil: 'domcontentloaded' })

let frames = 0
async function frame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.clock.runFor(frames % 3 === 2 ? 34 : 33) // 33.3 ms on average -> 30 fps
    await page.evaluate(() => window.__demoCursorSync?.())
    await write(await page.screenshot({ type: 'jpeg', quality: 90 }))
    frames++
  }
}
const hold = (ms) => frame(Math.max(1, Math.round((ms / 1000) * FPS)))
const state = () => page.evaluate(() => window.__room?.store.getState())
// tapes are aimed at their spine (front face), everything else at its centre
const at = (name) => page.evaluate((n) => window.__room.screenOf(n, n.startsWith('Tape:')), name)

let mouse = { x: W * 0.62, y: H * 0.72 }
async function moveTo(p, n = 24) {
  if (!p) return
  const a = { ...mouse }
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    mouse = { x: a.x + (p.x - a.x) * e, y: a.y + (p.y - a.y) * e }
    await page.mouse.move(mouse.x, mouse.y)
    await frame()
  }
}
/** glide to an object, then correct for anything that moved meanwhile (camera, hover pull) */
async function point(name, n = 26) {
  await moveTo(await at(name), n)
  const q = await at(name)
  if (q && Math.hypot(q.x - mouse.x, q.y - mouse.y) > 3) await moveTo(q, 6)
}
async function click() {
  await page.mouse.down()
  await frame(2)
  await page.mouse.up()
  await frame()
}
async function key(k) {
  await page.keyboard.press(k)
  await frame()
}

// loading: the progress bar on the CRT while the room streams in, as a half-speed time-lapse of
// the real load (at most 3 s; decoding and shader compiles block the page, so frames are uneven)
await page.mouse.move(mouse.x, mouse.y)
let loading = 0
let last
while ((await state())?.phase !== 'ready') {
  const t = Date.now()
  await page.clock.runFor(33)
  last = await page.screenshot({ type: 'jpeg', quality: 90 })
  const k = Math.min(12, Math.max(1, Math.round((Date.now() - t) / 66)))
  for (let i = 0; i < k && loading < 90; i++, loading++, frames++) await write(last)
}
for (; last && loading < 36; loading++, frames++) await write(last)
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
await hold(1300)

// enter without sound
const entry = await page.evaluate(() => {
  const r = document.querySelectorAll('.entry .hit')[1]?.getBoundingClientRect()
  return r ? { x: r.x + r.width * 0.55, y: r.y + r.height / 2 } : null
})
await moveTo(entry, 30)
await hold(350)
await click()
await hold(3300)

// look around the desk, then pick up the notepad
await point('TV_Shell')
await hold(600)
await point('Tape:escrochain')
await hold(900)
await point('Notepad')
await hold(500)
await click()
await hold(2300)

// play a tape from the stack
await point('Tape:escrochain', 30)
await hold(600)
await click()
await hold(5200)

// then pick another one from the notepad list
const row = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.page .hit')].find((x) => /Hemodialysis/i.test(x.textContent ?? ''))
  const r = b?.getBoundingClientRect()
  return r ? { x: r.x + Math.min(r.width / 3, 220), y: r.y + r.height / 2 } : null
})
await moveTo(row, 30)
await hold(600)
await click()
await hold(5600)

// put the notepad down, park the pointer
await key('Escape')
await moveTo({ x: W * 0.5, y: H * 0.9 }, 20)
await hold(1800)

// about: the old computer, scroll the bio
await key('a')
await hold(3400)
for (let i = 0; i < 6; i++) {
  await key('ArrowDown')
  await hold(170)
}
await hold(700)
// the switch above the computer: the tube light blinks on, then off again
await point('SwitchBoard', 22)
await hold(400)
await click()
await hold(2600)
await click()
await hold(900)
await key('Escape')
await hold(2100)

// résumé, contact, then the Discman, back to the desk
await key('r')
await hold(3000)
await key('c')
await hold(3000)
// back at the desk, the Discman: a click starts the music (through the desk speakers) and opens its controls
await key('Escape')
await hold(2000)
await point('CDPlayer', 26)
await hold(400)
await click()
await hold(3400)
await key('Escape')
await hold(1600)
// the desk lamp off and on again, then lightning over the city
await point('Lamp', 22)
await hold(300)
await click()
await hold(1500)
await click()
await hold(700)
await moveTo({ x: W * 0.5, y: H * 0.9 }, 20)
await page.evaluate(() => window.__room.lighting.strike())
await hold(2600)

const final = await state()
await browser.close()
enc.p.stdin.end()
await enc.done
console.log(`saved ${mp4} — ${frames} frames, ${(frames / FPS).toFixed(1)} s, view=${final?.view}, vcr=${final?.vcr.status}/${final?.vcr.tape}`)
if (errors.length) console.log('page errors:', errors)

if (args.includes('--webm')) {
  const webm = join(out, 'demo.webm')
  await run(['-i', mp4, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', webm]).done
  console.log('saved', webm)
}
