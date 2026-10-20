/** Capability checks used to choose between the 3D room, a lighter room, and the reading version. */

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()

/** ?reading (or ?reading=1) opens the simple reading version. */
export const wantsReading = () => params.has('reading') && params.get('reading') !== '0'

/** ?quality=low|high overrides the automatic choice. */
export function detectLowPower(): boolean {
  const q = params.get('quality')
  if (q === 'low') return true
  if (q === 'high') return false
  const nav = navigator as Navigator & { deviceMemory?: number }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 600
  const fewCores = (nav.hardwareConcurrency ?? 8) <= 4
  const lowMem = (nav.deviceMemory ?? 8) <= 4
  return (coarse && small) || (fewCores && lowMem)
}

export const isPortrait = () => window.innerHeight > window.innerWidth * 1.05
