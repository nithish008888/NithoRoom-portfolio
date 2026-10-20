import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'

export type Ctx = CanvasRenderingContext2D

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

/** CanvasTexture configured for glTF-UV'd meshes (glTF flips V, so no flipY). */
export function canvasTexture(canvas: HTMLCanvasElement, opts: { mipmaps?: boolean; anisotropy?: number } = {}) {
  const t = new CanvasTexture(canvas)
  t.flipY = false
  t.colorSpace = SRGBColorSpace
  t.generateMipmaps = opts.mipmaps ?? true
  t.minFilter = t.generateMipmaps ? LinearMipmapLinearFilter : LinearFilter
  t.anisotropy = opts.anisotropy ?? 8
  return t
}

/** Font helper: canvas fontStretch is used where supported (variable Archivo width axis). */
export function setFont(ctx: Ctx, font: string, stretch: CanvasFontStretch = 'normal') {
  ctx.font = font
  if ('fontStretch' in ctx) (ctx as Ctx & { fontStretch: CanvasFontStretch }).fontStretch = stretch
}

/** Draw text shrunk to fit maxWidth. Returns the used size. */
export function fitText(ctx: Ctx, text: string, x: number, y: number, maxWidth: number, size: number, fontFor: (s: number) => string, stretch: CanvasFontStretch = 'normal') {
  let s = size
  setFont(ctx, fontFor(s), stretch)
  while (ctx.measureText(text).width > maxWidth && s > 6) {
    s -= 1
    setFont(ctx, fontFor(s), stretch)
  }
  ctx.fillText(text, x, y)
  return s
}

/** Word-wrap into lines no wider than maxWidth (uses current font). */
export function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

/** Deterministic pseudo random for stable "hand" jitter. */
export function rand(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

/** Paper grain: subtle speckle + fibres over the current canvas. */
export function grain(ctx: Ctx, w: number, h: number, amount = 0.05, seed = 7) {
  const r = rand(seed)
  ctx.save()
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = r() * w
    const y = r() * h
    const a = r() * amount
    ctx.fillStyle = r() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.7})`
    ctx.fillRect(x, y, 1 + r() * 2, 1 + r() * 2)
  }
  ctx.restore()
}

export function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function shade(hex: string, f: number) {
  const { r, g, b } = hexToRgb(hex)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))))
  return `rgb(${c(r)},${c(g)},${c(b)})`
}
