import { Vector3, type Camera, type Mesh, type Object3D } from 'three'

/**
 * Screen-space anchors: 3D surfaces (notepad page, CRT, terminal…) publish
 * their projected corners every frame; DOM overlays read them to place real,
 * focusable HTML exactly over the in-world content (CSS matrix3d homography).
 */
export type Quad = { pts: [number, number][]; visible: boolean; w: number; h: number }

export const anchors = new Map<string, Quad>()

/** Local positions of the vertices sitting at UV (0,0) (1,0) (1,1) (0,1) — canvas TL, TR, BR, BL. */
export function uvCorners(mesh: Mesh): Vector3[] {
  const pos = mesh.geometry.getAttribute('position')
  const uv = mesh.geometry.getAttribute('uv')
  const targets = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]
  return targets.map(([tu, tv]) => {
    let best = 0
    let bd = Infinity
    for (let i = 0; i < uv.count; i++) {
      const d = (uv.getX(i) - tu!) ** 2 + (uv.getY(i) - tv!) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return new Vector3(pos.getX(best), pos.getY(best), pos.getZ(best))
  })
}

const v = new Vector3()
const vv = new Vector3()

export function publishQuad(name: string, obj: Object3D, local: Vector3[], camera: Camera, width: number, height: number, w: number, h: number) {
  const pts: [number, number][] = []
  let visible = true
  for (const p of local) {
    v.copy(p)
    obj.localToWorld(v)
    vv.copy(v).applyMatrix4(camera.matrixWorldInverse)
    if (vv.z > -0.01) visible = false
    v.project(camera)
    pts.push([((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height])
  }
  anchors.set(name, { pts, visible, w, h })
}

/** CSS matrix3d mapping an element of size (w, h) onto the quad TL, TR, BR, BL. */
export function quadToMatrix3d(w: number, h: number, q: [number, number][]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q as [[number, number], [number, number], [number, number], [number, number]]
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const dy3 = y0 - y1 + y2 - y3
  let g = 0
  let hh = 0
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1
    g = (dx3 * dy2 - dx2 * dy3) / det
    hh = (dx1 * dy3 - dx3 * dy1) / det
  }
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + hh * x3
  const c = x0
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + hh * y3
  const f = y0
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${c},${f},0,1)`
}

/** Axis-aligned screen rect of an object's bounding box (focus rings for hotspots). */
export function screenRect(obj: Object3D, camera: Camera, width: number, height: number, out: { x: number; y: number; w: number; h: number; visible: boolean }) {
  const box = (obj.userData.box as import('three').Box3 | undefined)
  if (!box) return out
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  out.visible = true
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
    vv.copy(v).applyMatrix4(camera.matrixWorldInverse)
    if (vv.z > -0.01) out.visible = false
    v.project(camera)
    const sx = ((v.x + 1) / 2) * width
    const sy = ((1 - v.y) / 2) * height
    x0 = Math.min(x0, sx)
    y0 = Math.min(y0, sy)
    x1 = Math.max(x1, sx)
    y1 = Math.max(y1, sy)
  }
  out.x = x0
  out.y = y0
  out.w = x1 - x0
  out.h = y1 - y0
  return out
}
