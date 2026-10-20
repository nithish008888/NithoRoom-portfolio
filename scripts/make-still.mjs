// Renders the overview without UI to public/images/still.jpg (social card + reading/fallback hero).
// node scripts/make-still.mjs [baseUrl]
import { chromium } from 'playwright'
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.argv[2] ?? 'http://127.0.0.1:4810/'
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage()
await page.goto(base)
await page.waitForFunction(() => window.__room?.store.getState().phase === 'ready', null, { timeout: 120000 })
await page.evaluate(() => [...document.querySelectorAll('.entry .hit')][1].click())
// wait for the entry move to finish and the TV's static burst to clear
await page.waitForTimeout(600)
await page.waitForFunction(() => !window.__room.store.getState().moving, null, { timeout: 60000 })
await page.waitForTimeout(2600)
await page.addStyleTag({ content: '.hud{display:none!important}' })
await page.waitForTimeout(400)
const png = await page.screenshot()
await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(join(out, 'still.jpg'))
await sharp(png).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82, mozjpeg: true }).toFile(join(out, 'card.jpg'))
console.log('saved still.jpg + card.jpg')
await browser.close()
