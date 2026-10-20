import type { CanvasTexture } from 'three'
import { projects, type Project } from '../../content/site'
import { canvasTexture, grain, makeCanvas, rand, setFont, wrap, type Ctx } from '../../lib/canvas'
import { F } from '../../lib/fonts'

/** Page plane is 0.213 x 0.265 m; canvas keeps the same aspect. */
export const PAGE_W = 1440
export const PAGE_H = 1792
const PITCH = 64 // ruled line spacing
const FIRST_RULE = 236
const MARGIN = 196
const RIGHT = PAGE_W - 70
const INK = '#1b1d2c'
const RED = '#b8352a'
const BLUE_INK = '#24408f'

export type HitBox = {
  id: string
  kind: 'project' | 'link'
  label: string
  x: number
  y: number
  w: number
  h: number
  href?: string
  projectId?: string
}

export type PageState = {
  selected: Project | null
  status: string
  hover: string | null
  focus: string | null
}

const snap = (y: number) => FIRST_RULE + Math.ceil((y - FIRST_RULE) / PITCH) * PITCH - 12

/** The Work notepad: handwritten list of projects + details of the loaded tape. */
export class NotepadPage {
  readonly canvas: HTMLCanvasElement
  readonly ctx: Ctx
  readonly texture: CanvasTexture
  hits: HitBox[] = []
  private paper: HTMLCanvasElement
  private key = ''

  constructor() {
    const { canvas, ctx } = makeCanvas(PAGE_W, PAGE_H)
    this.canvas = canvas
    this.ctx = ctx
    this.texture = canvasTexture(canvas, { anisotropy: 12 })
    this.paper = makePaper()
  }

  render(s: PageState) {
    const key = `${s.selected?.id}|${s.status}|${s.hover}|${s.focus}`
    if (key === this.key) return false
    this.key = key
    const c = this.ctx
    c.drawImage(this.paper, 0, 0)
    this.hits = []
    const jit = rand(11)

    // header
    hand(c, 'Work', MARGIN + 36, 168, 150, 700, INK, jit)
    c.strokeStyle = INK
    c.lineWidth = 5
    scribbleLine(c, MARGIN + 30, 186, MARGIN + 330, 180, jit)
    setFont(c, `600 52px ${F.hand}`)
    c.fillStyle = '#3d4466'
    c.textAlign = 'right'
    c.fillText(s.status, RIGHT, 150)
    c.textAlign = 'left'

    let y = FIRST_RULE + PITCH - 12
    const p = s.selected
    if (p) {
      const idx = projects.indexOf(p)
      circleNumber(c, MARGIN - 92, y - 14, String(idx + 1).padStart(2, '0'), jit)
      setFont(c, `700 92px ${F.hand}`)
      const titleLines = wrap(c, p.title, RIGHT - MARGIN - 60)
      for (const l of titleLines) {
        hand(c, l, MARGIN + 30, y, 92, 700, INK, jit)
        y += PITCH * 1.25
      }
      y = snap(y - 6)
      setFont(c, `600 58px ${F.hand}`)
      for (const l of wrap(c, p.summary, RIGHT - MARGIN - 40)) {
        hand(c, l, MARGIN + 30, y, 58, 600, p.placeholderFields?.includes('summary') ? '#6a6e86' : INK, jit)
        y += PITCH
      }
      const meta = [p.period, p.team].filter(Boolean).join(' · ')   // e.g. '2026 · Final-year project with …'
      if (meta) {
        setFont(c, `600 50px ${F.hand}`)
        hand(c, meta, MARGIN + 30, y, 50, 600, '#3d4466', jit)
        y += PITCH
      }
      if (p.contribution.length && !p.placeholderFields?.includes('contribution')) {
        hand(c, 'what I did', MARGIN + 30, y, 58, 700, RED, jit)
        y += PITCH
        setFont(c, `600 52px ${F.hand}`)
        for (const b of p.contribution.slice(0, 3)) {
          const lines = wrap(c, b, RIGHT - MARGIN - 100)
          lines.forEach((l, i) => {
            hand(c, (i === 0 ? '– ' : '   ') + l, MARGIN + 40, y, 52, 600, INK, jit)
            y += PITCH
          })
        }
      }
      if (p.tech.length) {
        setFont(c, `600 52px ${F.hand}`)
        const t = `built with: ${p.tech.join(' · ')}`
        for (const l of wrap(c, t, RIGHT - MARGIN - 40)) {
          hand(c, l, MARGIN + 30, y, 52, 600, '#2f3550', jit)
          y += PITCH
        }
      }
      for (const link of p.links) {
        const text = `${link.label} ↗`
        setFont(c, `600 54px ${F.hand}`)
        const w = c.measureText(text).width
        const id = `link:${p.id}:${link.href}`
        const hov = s.hover === id || s.focus === id
        if (hov) highlighter(c, MARGIN + 24, y - 44, w + 14, 56, 'rgba(120,170,255,0.35)', jit)
        hand(c, text, MARGIN + 30, y, 54, 600, BLUE_INK, jit)
        c.strokeStyle = BLUE_INK
        c.lineWidth = 3
        scribbleLine(c, MARGIN + 30, y + 8, MARGIN + 30 + w, y + 6, jit)
        this.hits.push({ id, kind: 'link', label: `Open ${link.label}`, x: MARGIN + 20, y: y - 52, w: w + 30, h: 70, href: link.href })
        y += PITCH
      }
      if (p.placeholder || p.placeholderFields?.length) {
        const what = p.placeholder ? 'placeholder — details pending' : `${p.placeholderFields!.join(', ')} pending`
        stamp(c, RIGHT - 30, FIRST_RULE + 40, what, jit)
      }
      y = snap(y + PITCH * 0.6)
    } else {
      setFont(c, `600 58px ${F.hand}`)
      for (const l of ['Pick a tape from the desk —', 'or tap a title below to play it.']) {
        hand(c, l, MARGIN + 30, y, 58, 600, '#3d4466', jit)
        y += PITCH
      }
      y = snap(y + PITCH * 0.5)
    }

    // project list
    hand(c, 'Projects', MARGIN + 30, y, 70, 700, RED, jit)
    y += PITCH * 1.15
    projects.forEach((proj, i) => {
      const id = `project:${proj.id}`
      setFont(c, `600 60px ${F.hand}`)
      const label = proj.title
      const lines = wrap(c, label, RIGHT - MARGIN - 90)
      const h = lines.length * PITCH
      const hov = s.hover === id || s.focus === id
      const sel = p?.id === proj.id
      const w = Math.max(...lines.map((l) => c.measureText(l).width))
      if (hov) highlighter(c, MARGIN + 20, y - 50, w + 24, h - 4, 'rgba(255,92,140,0.33)', jit)
      setFont(c, `600 50px ${F.hand}`)
      c.fillStyle = '#4a4f6c'
      c.fillText(String(i + 1).padStart(2, '0'), MARGIN - 86, y)
      if (sel) circleNumber(c, MARGIN - 64, y - 16, '', jit)
      lines.forEach((l, k) => hand(c, l, MARGIN + 30, y + k * PITCH, 60, 600, INK, jit))
      if (proj.placeholder) {
        setFont(c, `600 40px ${F.hand}`)
        c.fillStyle = RED
        c.textAlign = 'right'
        c.fillText('(placeholder)', RIGHT, y + (lines.length - 1) * PITCH)
        c.textAlign = 'left'
      }
      this.hits.push({
        id,
        kind: 'project',
        label: `Play tape ${String(i + 1).padStart(2, '0')}: ${proj.title}`,
        x: MARGIN - 100,
        y: y - 58,
        w: RIGHT - MARGIN + 100,
        h: h + 8,
        projectId: proj.id,
      })
      y += h + PITCH * 0.25
    })

    setFont(c, `600 46px ${F.hand}`)
    c.fillStyle = '#6a6e86'
    c.fillText('Esc · put the notepad down', MARGIN + 30, PAGE_H - 70)
    this.texture.needsUpdate = true
    return true
  }
}

// ----------------------------------------------------------------------------- pen helpers
function hand(c: Ctx, text: string, x: number, y: number, size: number, weight: number, color: string, r: () => number) {
  setFont(c, `${weight} ${size}px ${F.hand}`)
  c.fillStyle = color
  c.save()
  c.translate(x, y + (r() - 0.5) * 3)
  c.rotate((r() - 0.5) * 0.008)
  c.fillText(text, 0, 0)
  c.restore()
}

function scribbleLine(c: Ctx, x0: number, y0: number, x1: number, y1: number, r: () => number) {
  c.beginPath()
  c.moveTo(x0, y0)
  c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + (r() - 0.5) * 8, x1, y1)
  c.stroke()
}

function circleNumber(c: Ctx, cx: number, cy: number, text: string, r: () => number) {
  c.strokeStyle = RED
  c.lineWidth = 4
  c.beginPath()
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2.15 - 0.4
    const rr = 1 + (r() - 0.5) * 0.04
    const x = cx + Math.cos(a) * 52 * rr
    const y = cy + Math.sin(a) * 40 * rr
    if (i === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  }
  c.stroke()
  if (text) {
    setFont(c, `600 50px ${F.hand}`)
    c.fillStyle = INK
    c.textAlign = 'center'
    c.fillText(text, cx, cy + 16)
    c.textAlign = 'left'
  }
}

function highlighter(c: Ctx, x: number, y: number, w: number, h: number, color: string, r: () => number) {
  c.save()
  c.fillStyle = color
  c.beginPath()
  c.moveTo(x, y + 6 + (r() - 0.5) * 6)
  c.lineTo(x + w, y + (r() - 0.5) * 6)
  c.lineTo(x + w + 4, y + h + (r() - 0.5) * 6)
  c.lineTo(x - 2, y + h + 4 + (r() - 0.5) * 6)
  c.closePath()
  c.fill()
  c.restore()
}

function stamp(c: Ctx, right: number, y: number, text: string, r: () => number) {
  c.save()
  setFont(c, `30px ${F.term}`)
  const t = text.toUpperCase()
  const w = c.measureText(t).width + 30
  c.translate(right - w, y)
  c.rotate(-0.035 + (r() - 0.5) * 0.01)
  c.strokeStyle = 'rgba(184,53,42,0.85)'
  c.lineWidth = 3
  c.strokeRect(0, -32, w, 44)
  c.fillStyle = 'rgba(184,53,42,0.9)'
  c.fillText(t, 15, 0)
  c.restore()
}

function makePaper() {
  const { canvas, ctx: c } = makeCanvas(PAGE_W, PAGE_H)
  const g = c.createLinearGradient(0, 0, PAGE_W, PAGE_H)
  g.addColorStop(0, '#f4d779')
  g.addColorStop(1, '#e9c763')
  c.fillStyle = g
  c.fillRect(0, 0, PAGE_W, PAGE_H)
  // rules
  c.strokeStyle = 'rgba(70,110,190,0.42)'
  c.lineWidth = 2.2
  for (let y = FIRST_RULE; y < PAGE_H - 20; y += PITCH) {
    c.beginPath()
    c.moveTo(0, y)
    c.lineTo(PAGE_W, y)
    c.stroke()
  }
  // double red margin
  c.strokeStyle = 'rgba(205,70,60,0.6)'
  c.lineWidth = 2.5
  for (const x of [MARGIN - 128, MARGIN - 116]) {
    c.beginPath()
    c.moveTo(x, 0)
    c.lineTo(x, PAGE_H)
    c.stroke()
  }
  // edges darken slightly, a faint fold near the top
  const v = c.createRadialGradient(PAGE_W / 2, PAGE_H / 2, PAGE_H * 0.3, PAGE_W / 2, PAGE_H / 2, PAGE_H * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(80,50,0,0.12)')
  c.fillStyle = v
  c.fillRect(0, 0, PAGE_W, PAGE_H)
  c.fillStyle = 'rgba(255,255,255,0.08)'
  c.fillRect(0, 18, PAGE_W, 6)
  grain(c, PAGE_W, PAGE_H, 0.06, 21)
  return canvas
}
