import type { CanvasTexture } from 'three'
import { site } from '../../content/site'
import { canvasTexture, makeCanvas, setFont, type Ctx } from '../../lib/canvas'
import { F } from '../../lib/fonts'

const W = 1024
const H = 770
const COLS = 42
const ROWS = 15
const PAD_X = 96
const TOP = 132
const LINE_H = 35

export type TermLine = { text: string; kind?: 'h' | 'link' | 'dim' | 'blank'; href?: string }

/** Builds ABOUT.TXT from the content file, wrapped to the terminal width. */
export function aboutLines(): TermLine[] {
  const out: TermLine[] = []
  const wrapText = (t: string, indent = '') => {
    const words = t.split(/\s+/)
    let line = indent
    for (const w of words) {
      if ((line + (line.trim() ? ' ' : '') + w).length > COLS) {
        out.push({ text: line })
        line = indent + w
      } else line = line.trim() ? `${line} ${w}` : indent + w
    }
    if (line.trim()) out.push({ text: line })
  }
  const blank = () => out.push({ text: '', kind: 'blank' })
  out.push({ text: site.name.toUpperCase(), kind: 'h' })
  out.push({ text: site.location, kind: 'dim' })
  blank()
  for (const p of site.about.paragraphs) {
    wrapText(p)
    blank()
  }
  out.push({ text: 'Things I like doing', kind: 'h' })
  for (const i of site.about.interests) wrapText(`* ${i}`, '  ')
  blank()
  out.push({ text: 'Skills', kind: 'h' })
  for (const s of site.about.skills) wrapText(`${s.label.padEnd(11)} ${s.items.join(', ')}`)
  blank()
  out.push({ text: 'Education', kind: 'h' })
  for (const e of site.about.education) {
    wrapText(e.school)
    wrapText(`${e.degree}${e.period ? ` (${e.period})` : ''}`, '  ')
    if (e.note) wrapText(e.note, '  ')
  }
  blank()
  out.push({ text: 'Links', kind: 'h' })
  for (const l of site.contact.links) out.push({ text: `> ${l.label}: ${l.href.replace(/^mailto:|^https:\/\//, '')}`, kind: 'link', href: l.href })
  out.push({ text: '> Résumé (PDF)', kind: 'link', href: site.resume.pdf })
  blank()
  out.push({ text: '-- end of file --', kind: 'dim' })
  return out
}

/** Old computer's monochrome terminal: a little pager for ABOUT.TXT. */
export class Terminal {
  readonly canvas: HTMLCanvasElement
  readonly ctx: Ctx
  readonly texture: CanvasTexture
  readonly lines = aboutLines()
  scroll = 0
  /** characters revealed by the boot "type" effect */
  reveal = 0
  booted = false
  focusLink = -1
  private key = ''
  private t = 0

  constructor() {
    const { canvas, ctx } = makeCanvas(W, H)
    this.canvas = canvas
    this.ctx = ctx
    this.texture = canvasTexture(canvas, { mipmaps: false })
  }

  get maxScroll() {
    return Math.max(0, this.lines.length - ROWS)
  }
  get rows() {
    return ROWS
  }
  scrollBy(n: number) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + n))
  }
  scrollTo(n: number) {
    this.scroll = Math.max(0, Math.min(this.maxScroll, n))
  }

  /** visible link rows (canvas px) for the DOM overlay */
  linkBoxes() {
    const boxes: { href: string; label: string; x: number; y: number; w: number; h: number; index: number }[] = []
    for (let r = 0; r < ROWS; r++) {
      const i = this.scroll + r
      const l = this.lines[i]
      if (l?.kind === 'link' && l.href) boxes.push({ href: l.href, label: l.text.replace(/^> /, ''), x: PAD_X - 8, y: TOP + r * LINE_H - 30, w: W - PAD_X * 2 + 16, h: LINE_H, index: i })
    }
    return boxes
  }

  update(dt: number, active: boolean, reduced: boolean) {
    this.t += dt
    if (active && !this.booted) {
      this.reveal = reduced ? 1e9 : this.reveal + dt * 900
      if (this.reveal > 2400) this.booted = true
    }
    const blink = Math.floor(this.t * 2) % 2
    const key = `${this.scroll}|${Math.floor(this.reveal / 40)}|${this.booted}|${blink}|${this.focusLink}|${active}`
    if (key === this.key) return
    this.key = key
    this.draw(blink === 0)
    this.texture.needsUpdate = true
  }

  private draw(cursor: boolean) {
    const c = this.ctx
    c.fillStyle = '#020503'
    c.fillRect(0, 0, W, H)
    const green = '#bfffcf'
    const bar = (y: number, left: string, right: string) => {
      c.fillStyle = green
      c.fillRect(PAD_X - 16, y - 31, W - PAD_X * 2 + 32, 40)
      c.fillStyle = '#031006'
      setFont(c, `38px ${F.term}`)
      c.textAlign = 'left'
      c.fillText(left, PAD_X, y)
      c.textAlign = 'right'
      c.fillText(right, W - PAD_X, y)
      c.textAlign = 'left'
    }
    const total = this.lines.length
    const pct = this.maxScroll ? Math.round((this.scroll / this.maxScroll) * 100) : 100
    bar(98, 'ABOUT.TXT', `${pct}%  ${this.scroll + 1}-${Math.min(total, this.scroll + ROWS)}/${total}`)
    setFont(c, `40px ${F.term}`)
    let budget = this.reveal
    for (let r = 0; r < ROWS; r++) {
      const i = this.scroll + r
      const l = this.lines[i]
      if (!l) break
      let text = l.text
      if (!this.booted) {
        if (budget <= 0) break
        text = text.slice(0, Math.max(0, Math.floor(budget)))
        budget -= l.text.length + 6
      }
      const y = TOP + 24 + r * LINE_H
      c.shadowColor = 'rgba(140,255,170,0.6)'
      c.shadowBlur = 8
      if (l.kind === 'h') {
        c.fillStyle = '#e8fff0'
        setFont(c, `42px ${F.term}`)
      } else if (l.kind === 'dim') {
        c.fillStyle = 'rgba(170,255,190,0.6)'
        setFont(c, `40px ${F.term}`)
      } else {
        c.fillStyle = green
        setFont(c, `40px ${F.term}`)
      }
      if (l.kind === 'link' && this.focusLink === i) {
        c.fillStyle = green
        c.fillRect(PAD_X - 8, y - 31, c.measureText(text).width + 16, 38)
        c.fillStyle = '#031006'
      }
      c.fillText(text, PAD_X, y)
      if (l.kind === 'link') {
        const w = c.measureText(text).width
        c.fillRect(PAD_X, y + 5, w, 2)
      }
      c.shadowBlur = 0
    }
    if (!this.booted && cursor) {
      c.fillStyle = green
      c.fillRect(PAD_X, TOP + 4 + Math.min(ROWS - 1, Math.floor(this.reveal / 60)) * LINE_H, 20, 30)
    }
    bar(H - 74, '↑↓ SCROLL  SPACE PAGE  TAB LINKS', 'Q QUIT')
  }
}
