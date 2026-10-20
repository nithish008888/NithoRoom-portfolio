import type { CanvasTexture } from 'three'
import { canvasTexture, makeCanvas, setFont, type Ctx } from '../../lib/canvas'
import { F } from '../../lib/fonts'
import type { VcrStatus } from '../../state/store'

const W = 512
const H = 122
const ON = '#7dffe0'
const GHOST = 'rgba(80,255,210,0.07)'

// 7-segment layout: a b c d e f g
const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc',
  '8': 'abcdefg', '9': 'abcfgd', '-': 'g', ' ': '',
}

function digit(c: Ctx, ch: string, x: number, y: number, w: number, h: number) {
  const t = Math.max(3, w * 0.16)
  const segs: Record<string, [number, number, number, number]> = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, h / 2 - t * 1.5],
    c: [x + w - t, y + h / 2 + t / 2, t, h / 2 - t * 1.5],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + h / 2 + t / 2, t, h / 2 - t * 1.5],
    f: [x, y + t, t, h / 2 - t * 1.5],
    g: [x + t, y + h / 2 - t / 2, w - 2 * t, t],
  }
  const on = SEG[ch] ?? ''
  for (const [k, r] of Object.entries(segs)) {
    c.fillStyle = on.includes(k) ? ON : GHOST
    c.save()
    // slight italic slant like real VFD glass
    c.transform(1, 0, -0.12, 1, (r[1] + r[3] / 2) * 0.12, 0)
    c.fillRect(r[0], r[1], r[2], r[3])
    c.restore()
  }
}

/** VCR fluorescent display: status icon, tape counter and a quiet night-time clock. */
export class VFD {
  readonly canvas: HTMLCanvasElement
  readonly ctx: Ctx
  readonly texture: CanvasTexture
  private last = ''
  private start = performance.now()

  constructor() {
    const { canvas, ctx } = makeCanvas(W, H)
    this.canvas = canvas
    this.ctx = ctx
    this.texture = canvasTexture(canvas, { mipmaps: false })
  }

  /** fictional time: starts at 23:04 and runs in real time */
  private clock() {
    const mins = 23 * 60 + 4 + Math.floor((performance.now() - this.start) / 60000)
    const h = Math.floor(mins / 60) % 24
    const m = mins % 60
    return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
  }

  update(status: VcrStatus, tape: number, time: number) {
    const blink = Math.floor(time * 2) % 2 === 0
    const key = `${status}|${tape}|${this.clock()}|${blink}`
    if (key === this.last) return
    this.last = key
    const c = this.ctx
    c.clearRect(0, 0, W, H)
    c.fillStyle = '#020807'
    c.fillRect(0, 0, W, H)
    c.shadowColor = 'rgba(120,255,220,0.9)'
    c.shadowBlur = 10
    // status
    setFont(c, `30px ${F.term}`)
    c.fillStyle = GHOST
    c.fillText('PLAY  LOAD  EJ', 18, 34)
    c.fillStyle = ON
    const label = status === 'playing' ? 'PLAY' : status === 'loading' || status === 'inserting' ? 'LOAD' : status === 'ejecting' ? 'EJ' : ''
    const xs: Record<string, number> = { PLAY: 18, LOAD: 104, EJ: 190 }
    if (label && (status === 'playing' || blink)) c.fillText(label, xs[label]!, 34)
    setFont(c, `26px ${F.term}`)
    c.fillStyle = status === 'empty' ? GHOST : ON
    c.fillText('HI-FI', 18, 104)
    c.fillStyle = ON
    c.fillText('VHS', 92, 104)
    // tape counter (two digits)
    const tn = status === 'empty' ? '--' : String(tape).padStart(2, '0')
    digit(c, tn[0]!, 170, 48, 30, 56)
    digit(c, tn[1]!, 208, 48, 30, 56)
    // clock HH:MM
    const t = this.clock()
    digit(c, t[0]!, 300, 26, 38, 78)
    digit(c, t[1]!, 346, 26, 38, 78)
    c.fillStyle = blink ? ON : GHOST
    c.fillRect(392, 46, 7, 7)
    c.fillRect(392, 80, 7, 7)
    digit(c, t[2]!, 410, 26, 38, 78)
    digit(c, t[3]!, 456, 26, 38, 78)
    c.shadowBlur = 0
    this.texture.needsUpdate = true
  }
}
