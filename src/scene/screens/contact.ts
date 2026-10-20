import type { CanvasTexture } from 'three'
import { site } from '../../content/site'
import { canvasTexture, grain, makeCanvas, setFont, type Ctx } from '../../lib/canvas'
import { F } from '../../lib/fonts'

export const CARD_W = 1200
export const CARD_H = 760

export type CardHit = { id: string; label: string; href: string; x: number; y: number; w: number; h: number }

/** Ruled index card with the contact links (typed), lifted for the Contact view. */
export class ContactCard {
  readonly canvas: HTMLCanvasElement
  readonly ctx: Ctx
  readonly texture: CanvasTexture
  hits: CardHit[] = []
  private hover: string | null = 'none'

  constructor() {
    const { canvas, ctx } = makeCanvas(CARD_W, CARD_H)
    this.canvas = canvas
    this.ctx = ctx
    this.texture = canvasTexture(canvas, { anisotropy: 12 })
    this.render(null)
  }

  render(hover: string | null) {
    if (hover === this.hover) return
    this.hover = hover
    const c = this.ctx
    c.fillStyle = '#f6f3ea'
    c.fillRect(0, 0, CARD_W, CARD_H)
    c.strokeStyle = 'rgba(200,60,60,0.75)'
    c.lineWidth = 3
    c.beginPath()
    c.moveTo(0, 150)
    c.lineTo(CARD_W, 150)
    c.stroke()
    c.strokeStyle = 'rgba(80,120,200,0.35)'
    c.lineWidth = 2
    for (let y = 222; y < CARD_H - 20; y += 72) {
      c.beginPath()
      c.moveTo(0, y)
      c.lineTo(CARD_W, y)
      c.stroke()
    }
    setFont(c, `700 96px ${F.hand}`)
    c.fillStyle = '#1b1d2c'
    c.fillText('Contact', 70, 118)
    setFont(c, `400 34px ${F.type}`)
    c.fillStyle = '#4a4a55'
    c.textAlign = 'right'
    c.fillText(site.location, CARD_W - 70, 112)
    c.textAlign = 'left'
    const rows: { id: string; label: string; text: string; href: string }[] = [
      ...site.contact.links.map((l) => ({
        id: l.href,
        label: l.label,
        text: l.href.startsWith('mailto:') ? `email   ${site.contact.email}` : `${l.label.toLowerCase().padEnd(7)} ${l.href.replace(/^https?:\/\//, '')}`,
        href: l.href,
      })),
      { id: 'resume', label: 'Résumé (PDF)', text: 'résumé  download the PDF ↓', href: site.resume.pdf },
    ]
    if (site.contact.phone.show) rows.push({ id: 'phone', label: 'Phone', text: `phone   ${site.contact.phone.value}`, href: `tel:${site.contact.phone.value.replace(/\s/g, '')}` })
    this.hits = []
    rows.forEach((r, i) => {
      const y = 208 + i * 72
      setFont(c, `700 40px ${F.type}`)
      const w = c.measureText(r.text).width
      const on = this.hover === r.id
      if (on) {
        c.fillStyle = 'rgba(31,63,191,0.13)'
        c.fillRect(60, y - 44, w + 24, 60)
      }
      c.fillStyle = on ? '#1f3fbf' : '#1b1d2c'
      c.fillText(r.text, 72, y)
      c.fillStyle = 'rgba(31,63,191,0.7)'
      c.fillRect(72, y + 8, w, 2)
      this.hits.push({ id: r.id, label: r.label, href: r.href, x: 56, y: y - 50, w: w + 32, h: 70 })
    })
    grain(c, CARD_W, CARD_H, 0.05, 17)
    this.texture.needsUpdate = true
  }
}
