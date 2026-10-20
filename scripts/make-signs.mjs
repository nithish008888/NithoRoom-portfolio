// Draws the city's neon shop signs (Tamil + English) as PNG textures for blender/build_city.py.
// Tamil needs proper text shaping, which Blender's text objects don't do, so the browser draws them.
// node scripts/make-signs.mjs   -> assets-src/generated/signs/<id>.png (+ signs.json with sizes)
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'assets-src', 'generated', 'signs')
await mkdir(out, { recursive: true })

// Generic shop words only (no real brands). frame: neon tube around the text; board: dark backing panel.
export const SIGNS = [
  { id: 'medicals_ta', text: 'தஞ்சாவூர் மெடிகல்ஸ்', color: '#ff4fd8', frame: true, board: true },
  { id: 'medicals_en', text: 'Thanjavur Medicals', color: '#59d8ff', frame: true, board: true, latin: true },
  { id: 'unavagam', text: 'உணவகம்', color: '#ffd23f', frame: true, board: true },
  { id: 'tea', text: 'டீ ஸ்டால்', color: '#4dff88', frame: true, board: true },
  { id: 'silks', text: 'தஞ்சை சில்க்ஸ்', color: '#ff5a3c', frame: true, board: true },
  { id: 'stores', text: 'ஜவுளி ஸ்டோர்ஸ்', color: '#b38cff', frame: true, board: true },
  { id: 'bakery', text: 'பேக்கரி', color: '#ff8a3d', frame: true, board: true },
  { id: 'mess', text: 'மெஸ்', color: '#ffe066', frame: true, board: true },
  { id: 'mobiles', text: 'மொபைல்ஸ்', color: '#3dfff0', frame: true, board: true },
  // rooftop letters on the hotel (no board: the sky shows between the letters)
  { id: 'lodge_ta', text: 'தஞ்சை லாட்ஜ்', color: '#ff3b2f', frame: false, board: false, size: 200 },
  { id: 'lodge_en', text: 'THANJAI LODGE', color: '#ffd9c2', frame: false, board: false, latin: true, size: 120 },
]

const font = async (f) => `data:font/woff2;base64,${(await readFile(join(root, 'node_modules', '@fontsource', 'catamaran', 'files', f))).toString('base64')}`
const css = `
@font-face { font-family: 'Cat'; src: url(${await font('catamaran-tamil-800-normal.woff2')}) format('woff2'); font-weight: 800; unicode-range: U+0B80-0BFF, U+200C-200D; }
@font-face { font-family: 'Cat'; src: url(${await font('catamaran-latin-800-normal.woff2')}) format('woff2'); font-weight: 800; }
`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
await page.setContent(`<style>${css}</style><div style="font:800 40px Cat">தமிழ் Aa</div>`)
await page.evaluate(() => document.fonts.ready)
const results = await page.evaluate(async (signs) => {
  await document.fonts.load('800 100px Cat', 'தஞ்சாவூர் Thanjavur')
  const res = []
  for (const s of signs) {
    const size = s.size ?? 150
    const c = document.createElement('canvas')
    const g = c.getContext('2d')
    g.font = `800 ${size}px Cat`
    const m = g.measureText(s.text)
    const padX = s.frame ? size * 0.55 : size * 0.3
    const padY = s.frame ? size * 0.42 : size * 0.25
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent
    c.width = Math.ceil(m.width + padX * 2)
    c.height = Math.ceil(asc + desc + padY * 2)
    const cx = c.width / 2, base = padY + asc
    g.font = `800 ${size}px Cat`
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    if (s.board) {
      g.fillStyle = 'rgba(14,10,12,0.96)'
      g.beginPath()
      g.roundRect(4, 4, c.width - 8, c.height - 8, size * 0.12)
      g.fill()
    }
    // neon: wide soft glow in the tube colour, then the tube itself, then a near-white core
    const tube = (draw, w) => {
      g.save()
      g.strokeStyle = s.color
      g.fillStyle = s.color
      g.shadowColor = s.color
      for (const [blur, alpha] of [[size * 0.35, 0.55], [size * 0.12, 0.9]]) {
        g.shadowBlur = blur
        g.globalAlpha = alpha
        draw(w)
      }
      g.restore()
      g.save()
      g.globalAlpha = 0.9
      g.strokeStyle = g.fillStyle = 'rgba(255,250,245,0.92)'
      draw(w * 0.42)
      g.restore()
    }
    const text = (w) => {
      g.lineWidth = w
      g.lineJoin = 'round'
      g.strokeText(s.text, cx, base)
    }
    tube(text, size * 0.075)
    if (s.frame) {
      const frame = (w) => {
        g.lineWidth = w
        g.beginPath()
        g.roundRect(size * 0.2, size * 0.2, c.width - size * 0.4, c.height - size * 0.4, size * 0.16)
        g.stroke()
      }
      tube(frame, size * 0.06)
    }
    res.push({ id: s.id, w: c.width, h: c.height, data: c.toDataURL('image/png') })
  }
  return res
}, SIGNS)
const meta = {}
for (const r of results) {
  await writeFile(join(out, `${r.id}.png`), Buffer.from(r.data.split(',')[1], 'base64'))
  meta[r.id] = { w: r.w, h: r.h, aspect: +(r.w / r.h).toFixed(4) }
}
await writeFile(join(out, 'signs.json'), JSON.stringify(meta, null, 1))
await browser.close()
console.log('signs', Object.keys(meta).length, '->', out)
