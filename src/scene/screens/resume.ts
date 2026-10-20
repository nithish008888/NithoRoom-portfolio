import type { CanvasTexture } from 'three'
import { projects, site } from '../../content/site'
import { canvasTexture, grain, makeCanvas, setFont, wrap, type Ctx } from '../../lib/canvas'
import { F } from '../../lib/fonts'

export const RES_W = 1240
export const RES_H = 1754
const L = 110
const R = RES_W - 110

export type ResumeHit = { id: 'download' | 'open'; label: string; x: number; y: number; w: number; h: number }

/** The printed résumé on the desk (typeset from the content file; the PDF is the original). */
export class ResumePage {
  readonly canvas: HTMLCanvasElement
  readonly ctx: Ctx
  readonly texture: CanvasTexture
  hits: ResumeHit[] = []
  private hover: string | null = 'none'

  constructor() {
    const { canvas, ctx } = makeCanvas(RES_W, RES_H)
    this.canvas = canvas
    this.ctx = ctx
    this.texture = canvasTexture(canvas, { anisotropy: 12 })
    this.render(null)
  }

  render(hover: string | null) {
    if (hover === this.hover) return
    this.hover = hover
    const c = this.ctx
    c.fillStyle = '#f2f0ea'
    c.fillRect(0, 0, RES_W, RES_H)
    c.fillStyle = '#16161a'
    c.textBaseline = 'alphabetic'
    let y = 150
    setFont(c, `700 64px ${F.type}`)
    c.fillText(site.name, L, y)
    y += 46
    setFont(c, `400 28px ${F.type}`)
    c.fillStyle = '#3a3a42'
    const contact = [site.location, site.contact.email, 'github.com/nithish008888']
    c.fillText(contact.join('  ·  '), L, y)
    y += 30
    c.fillRect(L, y, R - L, 3)
    y += 62
    const section = (t: string) => {
      c.fillStyle = '#16161a'
      setFont(c, `700 32px ${F.type}`)
      c.fillText(t.toUpperCase(), L, y)
      y += 14
      c.fillRect(L, y, 160, 2)
      y += 42
    }
    const para = (t: string, size = 29, indent = 0, color = '#141418') => {
      setFont(c, `700 ${size}px ${F.type}`)
      c.fillStyle = color
      for (const l of wrap(c, t, R - L - indent)) {
        c.fillText(l, L + indent, y)
        y += size * 1.38
      }
    }
    section('Summary')
    para(site.about.paragraphs.join(' '), 28)
    y += 14
    section('Skills')
    const sk = site.about.skills
    const colW = (R - L) / 2
    for (let i = 0; i < sk.length; i += 2) {
      for (let k = 0; k < 2; k++) {
        const s2 = sk[i + k]
        if (!s2) continue
        const x = L + k * colW
        setFont(c, `700 25px ${F.type}`)
        c.fillStyle = '#16161a'
        c.fillText(s2.label, x, y)
        setFont(c, `400 25px ${F.type}`)
        c.fillStyle = '#26262c'
        const t = s2.items.join(', ')
        c.fillText(t.length > 26 ? t.slice(0, 25) + '…' : t, x + 190, y)
      }
      y += 36
    }
    y += 16
    section('Projects')
    for (const p of [...projects].sort((a, b) => Number(!!a.placeholder) - Number(!!b.placeholder))) {
      setFont(c, `700 28px ${F.type}`)
      c.fillStyle = '#16161a'
      c.fillText(p.title + (p.placeholder ? '  [placeholder]' : ''), L, y)
      y += 36
      if (p.tech.length) para(`Tech: ${p.tech.join(', ')}`, 24, 0, '#3a3a45')
      if (!p.placeholderFields?.includes('contribution')) para(`• ${p.contribution[0]}`, 24, 18)
      else para('Details pending.', 24, 18, '#6a6a75')
      y += 10
    }
    y += 6
    section('Education')
    for (const e of site.about.education.slice(0, 2)) {
      setFont(c, `700 26px ${F.type}`)
      c.fillStyle = '#16161a'
      c.fillText(e.degree.replace(/ \(.*\)/, ''), L, y)
      c.textAlign = 'right'
      if (e.period) c.fillText(e.period, R, y)
      c.textAlign = 'left'
      y += 34
      para(e.school + (e.note ? ` — ${e.note}` : ''), 24, 0, '#2c2c34')
      y += 6
    }
    setFont(c, `400 22px ${F.type}`)
    c.fillStyle = '#5a5a65'
    c.fillText('Full details, school results and contact in the PDF.', L, Math.min(y + 14, RES_H - 230))
    // stamped buttons at the foot of the page
    const bw = 470
    const bh = 92
    const by = RES_H - 160
    this.hits = [
      { id: 'download', label: 'Download résumé PDF', x: L, y: by, w: bw, h: bh },
      { id: 'open', label: 'Open résumé PDF in a new tab', x: R - bw, y: by, w: bw, h: bh },
    ]
    for (const h of this.hits) {
      const on = this.hover === h.id
      c.save()
      c.translate(h.x + h.w / 2, h.y + h.h / 2)
      c.rotate(h.id === 'download' ? -0.015 : 0.012)
      c.strokeStyle = on ? '#1f3fbf' : 'rgba(31,63,191,0.85)'
      c.lineWidth = 5
      c.strokeRect(-h.w / 2, -h.h / 2, h.w, h.h)
      if (on) {
        c.fillStyle = 'rgba(31,63,191,0.12)'
        c.fillRect(-h.w / 2, -h.h / 2, h.w, h.h)
      }
      c.fillStyle = '#1f3fbf'
      setFont(c, `700 38px ${F.type}`)
      c.textAlign = 'center'
      c.fillText(h.id === 'download' ? 'DOWNLOAD PDF ↓' : 'OPEN PDF ↗', 0, 13)
      c.restore()
    }
    setFont(c, `400 22px ${F.type}`)
    c.fillStyle = '#7a7a85'
    c.textAlign = 'center'
    c.fillText('printed from the PDF résumé · the PDF is the original', RES_W / 2, RES_H - 40)
    c.textAlign = 'left'
    grain(c, RES_W, RES_H, 0.05, 31)
    this.texture.needsUpdate = true
  }
}
