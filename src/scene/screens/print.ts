/**
 * Printed artwork generated at runtime from the content file: tape labels,
 * brand lettering on the TV/VCR/computer/Discman, and the wall poster.
 * Coordinates for button legends mirror blender/build_scene.py.
 */
import { site, type Project } from '../../content/site'
import { fitText, grain, makeCanvas, setFont, shade, type Ctx } from '../../lib/canvas'
import { F } from '../../lib/fonts'

export type TapeKind = { project: Project; index: number } | { filler: number }

// generic blank cassettes in coloured sleeves (set dressing, not projects)
const FILLER = [
  { shell: '#1e4fa6', label: '#f1ede2', text: 'E-180', sub: 'HIGH GRADE' },
  { shell: '#7b2a36', label: '#efe9dc', text: 'E-240', sub: 'STANDARD' },
  { shell: '#2f6a43', label: '#eeeadb', text: 'VHS', sub: 'BLANK' },
  { shell: '#d9d2c2', label: '#f6f2e8', text: 'E-180', sub: 'HQ' },
  { shell: '#2a2a2e', label: '#ebe5d4', text: 'E-120', sub: 'BLANK' },
  { shell: '#b8862a', label: '#f4efe0', text: 'VHS', sub: 'HIGH GRADE' },
]

export function fillerStyle(i: number) {
  return FILLER[i % FILLER.length]!
}

/** Spine label area: 0.168 x 0.019 m -> 1024 x 116 px. The shell colour is painted around a
 *  smaller sticker so stacks read as colourful sleeves, like the reference. */
export function tapeSpine(kind: TapeKind): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(1024, 116)
  const shell = 'project' in kind ? kind.project.tape.shell : fillerStyle(kind.filler).shell
  const g = c.createLinearGradient(0, 0, 0, 116)
  g.addColorStop(0, shade(shell, 0.12))
  g.addColorStop(0.5, shell)
  g.addColorStop(1, shade(shell, -0.25))
  c.fillStyle = g
  c.fillRect(0, 0, 1024, 116)
  // moulded ridges on the plastic
  c.fillStyle = 'rgba(255,255,255,0.08)'
  for (let x = 12; x < 120; x += 14) c.fillRect(x, 10, 5, 96)
  c.textBaseline = 'middle'
  if ('project' in kind) {
    const p = kind.project
    // number block
    c.fillStyle = p.tape.accent
    c.fillRect(130, 14, 108, 88)
    setFont(c, `900 64px ${F.wide}`, 'condensed')
    c.fillStyle = shade(shell, -0.35)
    c.textAlign = 'center'
    c.fillText(String(kind.index + 1).padStart(2, '0'), 184, 61)
    // sticker with the title
    c.fillStyle = p.tape.label
    c.fillRect(252, 12, 560, 92)
    c.textAlign = 'left'
    c.fillStyle = '#16161a'
    fitText(c, p.short.toUpperCase(), 272, 62, 520, 62, (sz) => `900 ${sz}px ${F.wide}`, 'semi-condensed')
    setFont(c, `32px ${F.term}`)
    c.textAlign = 'right'
    c.fillStyle = 'rgba(255,255,255,0.88)'
    c.fillText(p.tape.tag, 1004, 62)
  } else {
    const f = fillerStyle(kind.filler)
    c.fillStyle = f.label
    c.fillRect(330, 16, 420, 84)
    c.fillStyle = '#c23b22'
    c.fillRect(330, 86, 420, 7)
    c.fillStyle = '#16161a'
    setFont(c, `900 52px ${F.wide}`, 'normal')
    c.textAlign = 'left'
    c.fillText(f.text, 352, 52)
    setFont(c, `28px ${F.term}`)
    c.textAlign = 'right'
    c.fillText(f.sub, 734, 54)
    c.fillStyle = 'rgba(255,255,255,0.6)'
    setFont(c, `26px ${F.term}`)
    c.fillText('VHS', 1004, 60)
  }
  grain(c, 1024, 116, 0.07, 3)
  return canvas
}

/** Top label: 0.172 x 0.036 m -> 768 x 160 px (handwritten) */
export function tapeTop(kind: TapeKind): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(768, 160)
  const label = 'project' in kind ? kind.project.tape.label : fillerStyle(kind.filler).label
  c.fillStyle = label
  c.fillRect(0, 0, 768, 160)
  c.strokeStyle = 'rgba(40,60,140,0.35)'
  c.lineWidth = 2
  for (let y = 52; y < 160; y += 38) {
    c.beginPath()
    c.moveTo(20, y)
    c.lineTo(748, y)
    c.stroke()
  }
  c.fillStyle = '#1b1d3a'
  c.textBaseline = 'alphabetic'
  if ('project' in kind) {
    fitText(c, kind.project.short, 30, 84, 520, 68, (s) => `700 ${s}px ${F.hand}`)
    setFont(c, `600 44px ${F.hand}`)
    c.fillStyle = '#b3261e'
    c.fillText(`tape ${String(kind.index + 1).padStart(2, '0')}`, 560, 82)
  } else {
    setFont(c, `600 56px ${F.hand}`)
    c.fillText(kind.filler % 2 ? 'blank' : '—', 34, 86)
  }
  grain(c, 768, 160, 0.07, 5)
  return canvas
}

// --------------------------------------------------------------------------- props lettering
const cream = 'rgba(226,220,204,0.92)'

/** TV_DecalTop: 0.342 x 0.024 m */
export function tvTop(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(1024, 72)
  c.fillStyle = cream
  c.textBaseline = 'middle'
  setFont(c, `700 40px Georgia, "Times New Roman", serif`)
  c.fillText(spaced(site.decor.tvBrand, 2), 22, 38)
  c.textAlign = 'right'
  c.fillStyle = 'rgba(205,175,120,0.9)'
  setFont(c, `italic 600 40px Georgia, "Times New Roman", serif`)
  c.fillText(site.decor.tvModel, 1000, 38)
  return canvas
}

/** TV_DecalBottom: 0.342 x 0.016 m. Button x positions (TV local) from build_scene.py */
export function tvBottom(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(1024, 48)
  const u = (x: number) => ((x + 0.171) / 0.342) * 1024
  c.fillStyle = 'rgba(200,196,186,0.75)'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  setFont(c, `22px ${F.term}`)
  c.fillText('POWER', u(-0.148), 24)
  for (let i = 0; i < 6; i++) c.fillText(String(i + 1), u(-0.107 + i * 0.026), 24)
  ;['VOL', 'BRT', 'CON'].forEach((t, i) => c.fillText(t, u(0.088 + i * 0.03), 24))
  return canvas
}

/** VCR_DecalTop: 0.40 x 0.011 m */
export function vcrTop(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(1024, 28)
  c.fillStyle = 'rgba(210,206,196,0.8)'
  c.textBaseline = 'middle'
  setFont(c, `20px ${F.term}`)
  c.fillText(`${site.decor.vcrBrand}  ·  VIDEO CASSETTE RECORDER`, 16, 15)
  c.textAlign = 'right'
  setFont(c, `900 24px ${F.wide}`, 'expanded')
  c.fillText('HQ', 1008, 15)
  return canvas
}

/** VCR_DecalBottom: 0.40 x 0.013 m; buttons at x = 0.085 + 0.025 i (VCR local) */
export function vcrBottom(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(1024, 34)
  const u = (x: number) => ((x + 0.2) / 0.4) * 1024
  c.fillStyle = 'rgba(205,200,190,0.75)'
  c.textBaseline = 'middle'
  setFont(c, `20px ${F.term}`)
  c.fillText('VHS  ·  HI-FI STEREO  ·  4 HEAD', 16, 17)
  c.textAlign = 'center'
  ;['REW', 'PLAY', 'FF', 'STOP', 'EJECT'].forEach((t, i) => c.fillText(t, u(0.085 + i * 0.025), 17))
  c.fillText('POWER', u(-0.183), 17)
  return canvas
}

/** PC_Decal: 0.305 x 0.04 m */
export function pcBadge(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(768, 100)
  c.fillStyle = 'rgba(70,62,50,0.85)'
  c.textBaseline = 'middle'
  setFont(c, `800 58px ${F.wide}`, 'semi-expanded')
  c.fillText(site.decor.pcBrand, 18, 54)
  c.textAlign = 'right'
  c.fillStyle = 'rgba(80,72,60,0.6)'
  setFont(c, `22px ${F.term}`)
  c.fillText(site.decor.pcModel, 600, 56)
  return canvas
}

/** CD_Decal: 0.12 x 0.12 m top print on the Discman lid */
export function cdLid(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(512, 512)
  c.translate(256, 256)
  c.strokeStyle = 'rgba(30,34,48,0.35)'
  c.lineWidth = 3
  c.beginPath()
  c.arc(0, 0, 180, 0, Math.PI * 2)
  c.stroke()
  c.fillStyle = 'rgba(28,32,44,0.75)'
  setFont(c, `22px ${F.term}`)
  const txt = 'PORTABLE CD PLAYER  ·  8× ANTI-SKIP  ·  DIGITAL AUDIO  ·  '
  for (let i = 0; i < txt.length; i++) {
    c.save()
    c.rotate((i / txt.length) * Math.PI * 2)
    c.fillText(txt[i]!, -6, -196)
    c.restore()
  }
  c.textAlign = 'center'
  setFont(c, `900 34px ${F.wide}`, 'expanded')
  c.fillText('DISC·MATE', 0, 120)
  return canvas
}

/** Poster on the window wall (0.45 x 0.62 m): the owner's photo over a big "ME", like a screen print. */
export function poster(photo?: HTMLImageElement | null): HTMLCanvasElement {
  const W = 1024
  const H = 1411
  const { canvas, ctx: c } = makeCanvas(W, H)
  const d = site.decor.poster
  const M = 28 // paper margin
  const stripY = 946
  const bandY = 1000
  c.fillStyle = '#efe7d6'
  c.fillRect(0, 0, W, H)
  // photo, cover-cropped into the upper panel and graded like an offset print
  const pw = W - 2 * M
  const ph = stripY - M
  c.save()
  c.beginPath()
  c.rect(M, M, pw, ph)
  c.clip()
  if (photo && photo.naturalWidth) {
    const k = Math.max(pw / photo.naturalWidth, ph / photo.naturalHeight)
    const dw = photo.naturalWidth * k
    const dh = photo.naturalHeight * k
    c.drawImage(photo, M + (pw - dw) / 2, M + (ph - dh) * 0.3, dw, dh)
  } else {
    c.fillStyle = '#3a2a22'
    c.fillRect(M, M, pw, ph)
  }
  c.globalCompositeOperation = 'multiply'
  c.fillStyle = 'rgba(255,214,172,0.32)'
  c.fillRect(M, M, pw, ph)
  c.globalCompositeOperation = 'screen'
  c.fillStyle = 'rgba(48,28,22,0.2)' // lifted blacks
  c.fillRect(M, M, pw, ph)
  c.globalCompositeOperation = 'source-over'
  const v = c.createRadialGradient(W / 2, M + ph * 0.42, ph * 0.32, W / 2, M + ph * 0.5, ph * 0.86)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(22,12,8,0.42)')
  c.fillStyle = v
  c.fillRect(M, M, pw, ph)
  c.fillStyle = 'rgba(30,20,40,0.07)' // halftone screen
  for (let y = M; y < stripY; y += 7) for (let x = M + ((y / 7) % 2) * 3.5; x < W - M; x += 7) c.fillRect(x, y, 2, 2)
  c.restore()
  // name strip and the colour band with the big ME
  c.fillStyle = '#1c1a3a'
  c.fillRect(M, stripY, pw, bandY - stripY)
  c.fillStyle = '#efe7d6'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  fitText(c, spaced(d.small, 1), W / 2, (stripY + bandY) / 2 + 2, pw - 60, 30, (s) => `700 ${s}px ${F.wide}`, 'semi-condensed')
  c.fillStyle = '#e4572e'
  c.fillRect(M, bandY, pw, H - M - bandY)
  c.textBaseline = 'alphabetic'
  c.fillStyle = '#f6efe2'
  fitText(c, d.big, W / 2, bandY + (H - M - bandY) / 2 + 128, pw - 120, 360, (s) => `900 ${s}px ${F.wide}`, 'expanded')
  c.textAlign = 'left'
  grain(c, W, H, 0.08, 9)
  return canvas
}

function spaced(t: string, n: number) {
  return t.split('').join(' '.repeat(Math.max(0, n - 1)) + ' ')
}

export function drawRoundedRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}
