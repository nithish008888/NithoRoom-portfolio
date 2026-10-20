import { Vector3 } from 'three'
import shotsJson from './shots.json'
import type { View } from '../state/store'

export type ShotKey = View | 'loading'
type RawShot = { pos: number[]; target: number[]; fov: number }
export type Shot = { pos: Vector3; target: Vector3; fov: number }

const raw = shotsJson as unknown as Record<string, RawShot> & { mobile: Record<string, RawShot> }

const DEG = Math.PI / 180

/** Picks the authored shot for this aspect ratio and widens the lens for narrow windows. */
export function resolveShot(key: ShotKey, aspect: number): Shot {
  const portrait = aspect < 0.85
  const base = (portrait ? raw.mobile[key] : undefined) ?? raw[key] ?? raw.overview
  const refAspect = portrait ? 9 / 16 : 16 / 9
  let fov = base.fov
  if (aspect < refAspect) {
    const hTan = Math.tan((fov * DEG) / 2) * refAspect
    fov = Math.min((2 * Math.atan(hTan / aspect)) / DEG, base.fov * 1.45)
  }
  return { pos: new Vector3(...(base.pos as [number, number, number])), target: new Vector3(...(base.target as [number, number, number])), fov }
}
