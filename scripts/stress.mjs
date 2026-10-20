// Rapid-input robustness check: hammer tapes and views, then verify a consistent final state.
// node scripts/stress.mjs [baseUrl]
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://127.0.0.1:4810/'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(base)
await page.waitForFunction(() => window.__room?.store.getState().phase === 'ready', null, { timeout: 120000 })
await page.evaluate(() => [...document.querySelectorAll('.entry .hit')][1].click())
await page.waitForTimeout(800) // interrupt the entry move on purpose

const hash = (h) => page.evaluate((x) => (location.hash = x), h)
const seq = [
  ['#/work/escrochain', 120],
  ['#/work/hemodialysis-vr', 90],
  ['#/work/ckd-screening-vr', 160],
  ['#/work/escrochain', 700], // let one tape get into the slide
  ['#/about', 120],
  ['#/work/hemodialysis-vr', 60],
  ['#/resume', 80],
  ['#/work/ckd-screening-vr', 1400], // mid-insert of another
  ['#/work/hemodialysis-vr', 150],
]
for (const [h, ms] of seq) {
  await hash(h)
  await page.waitForTimeout(ms)
}
// keyboard storm on the views
for (const k of ['Escape', 'a', 'w', 'r', 'c', 'm', 't', 'Escape', 'w']) {
  await page.keyboard.press(k)
  await page.waitForTimeout(70)
}
await page.waitForTimeout(7000)

const result = await page.evaluate(() => {
  const s = window.__room.store.getState()
  const { scene, camera } = window.__room.three
  const tapes = []
  scene.traverse((o) => {
    if (o.name.startsWith('Tape:')) tapes.push({ name: o.name, y: +o.position.y.toFixed(3), z: +o.position.z.toFixed(3) })
  })
  return { view: s.view, project: s.project, vcr: s.vcr, moving: s.moving, cam: camera.position.toArray().map((v) => +v.toFixed(3)), tapes }
})
console.log(JSON.stringify(result, null, 1))
const okVcr = result.vcr.tape === result.project && result.vcr.status === 'playing'
const airborne = result.tapes.filter((t) => t.y > 0.95 || t.y < 0.7)
const okCam = result.view === 'work' && !result.moving
console.log('vcr consistent:', okVcr, '| tapes at rest:', airborne.length === 0, '| camera settled:', okCam, '| errors:', errors.length)
if (errors.length) console.log(errors.slice(0, 5))
await browser.close()
process.exit(okVcr && airborne.length === 0 && okCam && !errors.length ? 0 : 1)
