import type { CanvasTexture } from 'three'
import { site, type Project } from '../../content/site'
import { canvasTexture, fitText, makeCanvas, setFont, shade, wrap, type Ctx } from '../../lib/canvas'
import { F } from '../../lib/fonts'

export type TVMode = 'loading' | 'ready' | 'title' | 'pick' | 'insert' | 'static' | 'program' | 'eject'

const W = 1024
const H = 780
const BLUE_TOP = '#2347d6'
const BLUE_BOT = '#1a35bd'
/** how long a still stays on screen in a project's media programme */
const IMAGE_SECONDS = 6
/** title card before a tape's footage */
const INTRO_SECONDS = 3.2
/** video captions fade out after this long, so they don't cover the footage */
const VIDEO_CAPTION_SECONDS = 6

type MediaEl = HTMLImageElement | HTMLVideoElement

/**
 * Draws the television picture into a canvas at ~30 fps.
 * Screen states mirror the reference: loading → enter → title card →
 * "pick a tape" → tracking static → the tape's programme → eject.
 */
export class TVScreen {
  readonly canvas: HTMLCanvasElement
  readonly ctx: Ctx
  readonly texture: CanvasTexture
  mode: TVMode = 'loading'
  modeTime = 0
  progress = 0
  /** 0 = with sound, 1 = without (ready screen highlight) */
  entryChoice = 0
  project: Project | null = null
  tapeNumber = 0
  /** caption shown at the bottom (subtitles) */
  private acc = 1
  private time = 0
  private noise: HTMLCanvasElement
  private media = new Map<string, MediaEl>()
  /** position in the programme's media list, and when (modeTime) that item came on */
  private mediaIdx = 0
  private mediaStart = 0
  private rewind = true
  sound = false
  /** the desk speakers are playing: keep tape audio quiet */
  music = false

  constructor() {
    const { canvas, ctx } = makeCanvas(W, H)
    this.canvas = canvas
    this.ctx = ctx
    this.texture = canvasTexture(canvas, { mipmaps: false })
    this.noise = makeNoiseTile()
    this.draw()
  }

  setMode(m: TVMode) {
    if (m === this.mode) return
    // leaving the programme (eject, another tape): its videos stop and start over next time
    if (this.mode === 'program') this.pauseMedia()
    this.mode = m
    this.modeTime = 0
    this.acc = 1
    this.mediaIdx = 0
    this.mediaStart = INTRO_SECONDS
    this.rewind = true
  }

  /** Average colour of the picture (drives the CRT glow light). */
  glow = { r: 0.12, g: 0.22, b: 0.95, i: 1 }

  update(dt: number) {
    this.time += dt
    this.modeTime += dt
    this.acc += dt
    if (this.acc < 1 / 30) return
    this.acc = 0
    this.draw()
    this.texture.needsUpdate = true
  }

  // --------------------------------------------------------------- drawing
  private draw() {
    const c = this.ctx
    c.save()
    c.clearRect(0, 0, W, H)
    switch (this.mode) {
      case 'loading':
        this.drawLoading(c)
        break
      case 'ready':
        this.drawReady(c)
        break
      case 'title':
        this.drawTitle(c)
        break
      case 'pick':
        this.drawPick(c)
        break
      case 'insert':
        this.drawInsert(c)
        break
      case 'static':
        this.drawStatic(c)
        break
      case 'program':
        this.drawProgram(c)
        break
      case 'eject':
        this.drawEject(c)
        break
    }
    c.restore()
  }

  private blue(c: Ctx, speckle = 0.18) {
    const g = c.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, BLUE_TOP)
    g.addColorStop(1, BLUE_BOT)
    c.fillStyle = g
    c.fillRect(0, 0, W, H)
    if (speckle > 0) {
      c.globalAlpha = speckle
      const ox = (this.time * 37) % 256
      const oy = (this.time * 23) % 256
      c.fillStyle = c.createPattern(this.noise, 'repeat')!
      c.translate(-ox, -oy)
      c.fillRect(0, 0, W + 256, H + 256)
      c.translate(ox, oy)
      c.globalAlpha = 1
    }
    this.glow = { r: 0.12, g: 0.24, b: 1.0, i: 1 }
  }

  private osd(c: Ctx, text: string, x: number, y: number, size = 44, align: CanvasTextAlign = 'left', color = '#f4f6ff') {
    setFont(c, `${size}px ${F.term}`)
    c.textAlign = align
    c.textBaseline = 'alphabetic'
    c.fillStyle = color
    c.shadowColor = 'rgba(255,255,255,0.55)'
    c.shadowBlur = 10
    c.fillText(text, x, y)
    c.shadowBlur = 0
  }

  private orbit(c: Ctx, cx: number, cy: number, rx: number, ry: number, rot: number, alpha = 0.85) {
    c.save()
    c.translate(cx, cy)
    c.rotate(rot)
    c.fillStyle = `rgba(235,240,255,${alpha})`
    const n = 120
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.time * 0.08
      const s = 2.2 + 1.2 * Math.sin(a * 3 + this.time)
      c.beginPath()
      c.arc(Math.cos(a) * rx, Math.sin(a) * ry, s, 0, Math.PI * 2)
      c.fill()
    }
    c.restore()
  }

  private sparkle(c: Ctx, x: number, y: number, r: number) {
    c.save()
    c.translate(x, y)
    c.strokeStyle = 'rgba(245,248,255,0.95)'
    c.lineWidth = 3
    c.shadowColor = 'rgba(255,255,255,0.8)'
    c.shadowBlur = 12
    c.beginPath()
    c.moveTo(-r, 0)
    c.lineTo(r, 0)
    c.moveTo(0, -r * 1.4)
    c.lineTo(0, r * 1.4)
    c.stroke()
    c.restore()
  }

  private drawLoading(c: Ctx) {
    this.blue(c, 0.1)
    this.osd(c, '▶▶ LOADING', 104, 124)
    this.osd(c, 'CH 00', W - 104, 124, 44, 'right')
    const blocks = 24
    const on = Math.round(this.progress * blocks)
    const bx = 150
    const by = 380
    for (let i = 0; i < blocks; i++) {
      c.fillStyle = i < on ? '#eef2ff' : 'rgba(238,242,255,0.18)'
      c.fillRect(bx + i * 25, by, 17, 34)
    }
    this.osd(c, `${Math.round(this.progress * 100)}%`, bx + blocks * 25 + 24, by + 32, 46)
    this.osd(c, 'TUNING IN · PLEASE WAIT', W / 2, 560, 34, 'center', 'rgba(235,240,255,0.7)')
  }

  private drawReady(c: Ctx) {
    this.blue(c, 0.12)
    this.osd(c, '■ READY', 104, 124)
    this.osd(c, 'CH 00', W - 104, 124, 44, 'right')
    const blink = Math.floor(this.time * 1.6) % 2 === 0
    this.osd(c, 'CHOOSE HOW TO ENTER', W / 2, 290, 46, 'center')
    const opts = ['ENTER WITH SOUND', 'ENTER WITHOUT SOUND']
    opts.forEach((o, i) => {
      const y = 400 + i * 96
      const sel = i === this.entryChoice
      setFont(c, `56px ${F.term}`)
      const w = c.measureText(o).width + 60
      if (sel) {
        c.fillStyle = '#eef2ff'
        c.fillRect(W / 2 - w / 2, y - 50, w, 66)
        this.osd(c, o, W / 2, y, 56, 'center', BLUE_BOT)
      } else this.osd(c, o, W / 2, y, 56, 'center')
      if (sel && blink) this.osd(c, '▶', W / 2 - w / 2 - 34, y, 50, 'center')
    })
    this.osd(c, 'audio is optional · you can change it later', W / 2, 650, 30, 'center', 'rgba(235,240,255,0.65)')
  }

  private drawTitle(c: Ctx) {
    this.blue(c, 0.16)
    this.orbit(c, W * 0.6, H * 0.6, 330, 120, -0.32, 0.8)
    c.strokeStyle = 'rgba(235,240,255,0.18)'
    c.lineWidth = 2
    c.beginPath()
    c.arc(W * 0.55, H * 0.55, 270, 0, Math.PI * 2)
    c.stroke()
    this.sparkle(c, W - 150, 205, 26)
    if (this.modeTime < 4 || Math.floor(this.time) % 6 !== 0) this.osd(c, '▶ PLAY', 104, 124)
    this.osd(c, 'CH 00', W - 104, 124, 44, 'right')
    c.fillStyle = '#f4f6ff'
    c.textAlign = 'left'
    c.shadowColor = 'rgba(255,255,255,0.45)'
    c.shadowBlur = 16
    const lines = site.titleLines
    let y = lines.length > 1 ? 300 : 390
    for (const line of lines) {
      fitText(c, line, 70, y, W - 140, 150, (s) => `900 ${s}px ${F.wide}`, 'condensed')
      y += 128
    }
    c.shadowBlur = 0
    this.osd(c, site.tagline.toUpperCase(), 72, y - 40, 34)
    this.osd(c, 'TAPE DECK · PICK A TAPE TO PLAY', 72, H - 70, 30, 'left', 'rgba(235,240,255,0.7)')
  }

  private drawPick(c: Ctx) {
    this.blue(c, 0.14)
    // concentric ripples like an idle test signal
    c.save()
    c.translate(W / 2, H / 2)
    for (let i = 0; i < 14; i++) {
      const r = ((i * 46 + this.time * 30) % 640) + 10
      c.strokeStyle = `rgba(150,175,255,${0.22 * (1 - r / 650)})`
      c.lineWidth = 14
      c.beginPath()
      c.arc(0, 0, r, 0, Math.PI * 2)
      c.stroke()
    }
    c.restore()
    this.osd(c, '■ STOP', 104, 124)
    this.osd(c, 'VIDEO 1', W - 104, 124, 44, 'right')
    this.osd(c, 'PICK A TAPE FROM THE DESK', W / 2, H / 2 + 14, 44, 'center')
    this.osd(c, 'or choose one on the notepad', W / 2, H / 2 + 70, 30, 'center', 'rgba(235,240,255,0.7)')
  }

  private drawInsert(c: Ctx) {
    this.blue(c, 0.12)
    const dots = '.'.repeat(1 + (Math.floor(this.time * 3) % 3))
    this.osd(c, `LOADING${dots}`, 104, 124)
    this.osd(c, 'VIDEO 1', W - 104, 124, 44, 'right')
    const p = this.project
    if (p) {
      this.osd(c, `TAPE ${String(this.tapeNumber).padStart(2, '0')}`, W / 2, H / 2 - 20, 40, 'center', 'rgba(235,240,255,0.75)')
      this.osd(c, p.short.toUpperCase(), W / 2, H / 2 + 50, 64, 'center')
    }
  }

  private drawStatic(c: Ctx) {
    c.fillStyle = '#777'
    c.fillRect(0, 0, W, H)
    this.osd(c, 'TRACKING', 104, 124)
    this.glow = { r: 0.6, g: 0.6, b: 0.62, i: 0.8 }
  }

  private drawEject(c: Ctx) {
    this.blue(c, 0.1)
    this.osd(c, '▲ EJECT', 104, 124)
    this.osd(c, `CH ${String(this.tapeNumber).padStart(2, '0')}`, W - 104, 124, 44, 'right')
  }

  private drawProgram(c: Ctx) {
    const p = this.project
    if (!p) return this.drawPick(c)
    const media = p.media
    if (media.length && this.modeTime < INTRO_SECONDS) {
      const first = media[0]!
      this.mediaEl(first.src, first.type) // start buffering behind the title card
      this.reelBackground(c, p)
      this.titleSlide(c, p)
      const fade = Math.min(1, this.modeTime / 0.3, (INTRO_SECONDS - this.modeTime) / 0.35)
      if (fade < 1) {
        c.fillStyle = `rgba(0,0,0,${1 - fade})`
        c.fillRect(0, 0, W, H)
      }
      this.subtitle(c, p.summary)
      const rgb = hexRgb01(p.tape.shell)
      this.glow = { r: rgb[0], g: rgb[1], b: rgb[2], i: 0.8 }
    } else if (media.length) this.drawMedia(c, p)
    else this.drawPlaceholderReel(c, p)
    if (this.modeTime < 3.5) this.osd(c, '▶ PLAY', 104, 124)
    this.osd(c, `CH ${String(this.tapeNumber).padStart(2, '0')}`, W - 104, 124, 44, 'right')
  }

  private mediaEl(src: string, type: 'video' | 'image'): MediaEl {
    let el = this.media.get(src)
    if (!el) {
      if (type === 'video') {
        const v = document.createElement('video')
        v.src = src
        v.muted = true
        v.loop = true
        v.playsInline = true
        v.crossOrigin = 'anonymous'
        v.preload = 'auto'
        el = v
      } else {
        const img = new Image()
        img.src = src
        el = img
      }
      this.media.set(src, el)
    }
    return el
  }

  /** stop videos that are not on screen */
  pauseMedia(except?: string) {
    for (const [src, el] of this.media) if (el instanceof HTMLVideoElement && src !== except) el.pause()
  }

  private drawMedia(c: Ctx, p: Project) {
    const list = p.media
    let m = list[this.mediaIdx % list.length]!
    let el = this.mediaEl(m.src, m.type)
    if (list.length > 1 && this.itemDone(el, this.modeTime - this.mediaStart)) {
      this.mediaIdx = (this.mediaIdx + 1) % list.length
      this.mediaStart = this.modeTime
      m = list[this.mediaIdx]!
      el = this.mediaEl(m.src, m.type)
      this.rewind = true
    }
    c.fillStyle = '#000'
    c.fillRect(0, 0, W, H)
    const shown = this.modeTime - this.mediaStart
    if (el instanceof HTMLVideoElement) {
      this.pauseMedia(m.src)
      if (this.rewind) el.currentTime = 0
      el.loop = list.length === 1
      el.muted = !this.sound || this.music
      if (el.paused && !el.ended) void el.play().catch(() => {})
      if (el.readyState >= 2) cover(c, el, el.videoWidth, el.videoHeight, 0)
      else {
        const poster = m.type === 'video' && m.poster ? this.mediaEl(m.poster, 'image') : null
        if (poster instanceof HTMLImageElement && poster.complete && poster.naturalWidth) cover(c, poster, poster.naturalWidth, poster.naturalHeight, 0)
        this.osd(c, 'LOADING…', 104, 124)
      }
    } else if (el.complete && el.naturalWidth) {
      cover(c, el, el.naturalWidth, el.naturalHeight, Math.min(1, shown / IMAGE_SECONDS))
    }
    this.rewind = false
    const capAlpha = m.type === 'video' ? Math.max(0, Math.min(1, (VIDEO_CAPTION_SECONDS - shown) / 0.6)) : 1
    if (capAlpha > 0) {
      c.globalAlpha = capAlpha
      this.subtitle(c, m.caption ?? p.summary)
      c.globalAlpha = 1
    }
    this.glow = { r: 0.5, g: 0.5, b: 0.55, i: 0.9 }
  }

  /** Images stay up for a few seconds, videos play once through; broken files are skipped. */
  private itemDone(el: MediaEl, shown: number) {
    if (!(el instanceof HTMLVideoElement)) return shown >= IMAGE_SECONDS || (el.complete && !el.naturalWidth && shown >= 2)
    if (el.error) return shown >= 2
    if (el.ended) return true
    return el.readyState < 2 && shown >= 10
  }

  private reelBackground(c: Ctx, p: Project) {
    const g = c.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, shade(p.tape.shell, 0.1))
    g.addColorStop(1, shade(p.tape.shell, -0.45))
    c.fillStyle = g
    c.fillRect(0, 0, W, H)
    c.globalAlpha = 0.12
    c.fillStyle = c.createPattern(this.noise, 'repeat')!
    c.fillRect(0, 0, W, H)
    c.globalAlpha = 1
  }

  /** Tape number, tag and the project title in big letters. */
  private titleSlide(c: Ctx, p: Project) {
    c.textAlign = 'left'
    c.fillStyle = '#fff'
    this.osd(c, `TAPE ${String(this.tapeNumber).padStart(2, '0')} · ${p.tape.tag}`, 70, 250, 36, 'left', p.tape.accent)
    c.shadowColor = 'rgba(255,255,255,0.4)'
    c.shadowBlur = 14
    setFont(c, `900 104px ${F.wide}`, 'condensed')
    const lines = wrap(c, p.title.toUpperCase(), W - 140).slice(0, 3)
    lines.forEach((l, i) => fitText(c, l, 70, 360 + i * 104, W - 140, 104, (s) => `900 ${s}px ${F.wide}`, 'condensed'))
    c.shadowBlur = 0
  }

  /** Placeholder "programme" built only from the content file, clearly labelled. */
  private drawPlaceholderReel(c: Ctx, p: Project) {
    const slides = 4
    const dur = 4.6
    const k = Math.floor(this.modeTime / dur) % slides
    const local = this.modeTime % dur
    const base = p.tape.shell
    this.reelBackground(c, p)
    const accent = p.tape.accent
    // slide content
    c.textAlign = 'left'
    c.fillStyle = '#fff'
    if (k === 0) {
      this.titleSlide(c, p)
    } else if (k === 1) {
      this.osd(c, 'WHAT I DID', 70, 230, 40, 'left', accent)
      setFont(c, `48px ${F.term}`)
      const lines = p.contribution.flatMap((b) => wrap(c, '› ' + b, W - 150)).slice(0, 8)
      lines.forEach((l, i) => this.osd(c, l, 70, 310 + i * 56, 48))
    } else if (k === 2) {
      this.osd(c, 'BUILT WITH', 70, 230, 40, 'left', accent)
      if (p.tech.length) {
        let x = 70
        let y = 330
        setFont(c, `52px ${F.term}`)
        for (const t of p.tech) {
          const w = c.measureText(t).width + 44
          if (x + w > W - 70) {
            x = 70
            y += 92
          }
          c.strokeStyle = accent
          c.lineWidth = 3
          c.strokeRect(x, y - 52, w, 70)
          this.osd(c, t, x + 22, y, 52)
          x += w + 22
        }
      } else this.osd(c, '— to be supplied —', 70, 330, 48, 'left', 'rgba(255,255,255,0.7)')
    } else {
      this.osd(c, 'FOOTAGE PENDING', W / 2, 330, 64, 'center', accent)
      this.osd(c, 'Screen recordings for this tape have not been added yet.', W / 2, 410, 34, 'center')
      this.osd(c, 'Add media in src/content/site.ts', W / 2, 460, 34, 'center', 'rgba(255,255,255,0.75)')
      // placeholder stamp
      c.save()
      c.translate(W / 2, 580)
      c.rotate(-0.06)
      c.strokeStyle = 'rgba(255,230,120,0.9)'
      c.lineWidth = 5
      c.strokeRect(-190, -42, 380, 70)
      this.osd(c, 'PLACEHOLDER', 0, 14, 50, 'center', 'rgba(255,230,120,0.95)')
      c.restore()
    }
    // fade between slides
    const fade = Math.min(1, local / 0.35, (dur - local) / 0.35)
    if (fade < 1) {
      c.fillStyle = `rgba(0,0,0,${1 - fade})`
      c.fillRect(0, 0, W, H)
    }
    // subtitles only where the slide leaves room for them
    if (k === 0 || k === 3) this.subtitle(c, p.placeholder ? 'Details for this project are on their way.' : p.summary)
    const rgb = hexRgb01(base)
    this.glow = { r: rgb[0], g: rgb[1], b: rgb[2], i: 0.8 }
  }

  private subtitle(c: Ctx, text: string) {
    setFont(c, `600 38px ${F.wide}`, 'semi-condensed')
    let lines = wrap(c, text, W - 200)
    if (lines.length > 2) {
      // keep subtitles to two lines: cut at a word boundary and add an ellipsis
      lines = lines.slice(0, 2)
      lines[1] = lines[1]!.replace(/[,;:]?\s*\S*$/, '') + '…'
    }
    c.textAlign = 'center'
    c.lineWidth = 6
    c.strokeStyle = 'rgba(0,0,0,0.65)'
    c.fillStyle = '#ffd84a'
    lines.forEach((l, i) => {
      const y = H - 80 - (lines.length - 1 - i) * 46
      c.strokeText(l, W / 2, y)
      c.fillText(l, W / 2, y)
    })
  }
}

function cover(c: Ctx, el: CanvasImageSource, w: number, h: number, ken: number) {
  const s = Math.max(W / w, H / h) * (1.04 + ken * 0.06)
  const dw = w * s
  const dh = h * s
  c.drawImage(el, (W - dw) / 2 - ken * 20, (H - dh) / 2, dw, dh)
}

function hexRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function makeNoiseTile() {
  const { canvas, ctx } = makeCanvas(256, 256)
  const img = ctx.createImageData(256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    const on = Math.random() < 0.012
    const v = on ? 200 + Math.random() * 55 : 0
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = on ? 255 : 0
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}
