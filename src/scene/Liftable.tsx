import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Matrix4, Quaternion, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three'
import { Tween, smoothstep } from '../lib/anim'
import { emit } from '../lib/events'
import { go } from '../state/router'
import { useStore, type View } from '../state/store'
import { publishQuad, uvCorners } from './anchors'
import { resolveShot } from './shots'

const DEG = Math.PI / 180

type Props = {
  /** the group that moves */
  object: Object3D | undefined
  /** the printed surface (UV 0..1) */
  page: Mesh | undefined
  view: View
  anchor: string
  canvasSize: [number, number]
  /** page size in metres (width along local X, height along local Z) */
  size: [number, number]
  /** fraction of the viewport height (landscape) the page should fill */
  fill?: number
  hoverLabel: string
  onFrame?: (k: number) => void
}

/** Something on the desk that is picked up and held in front of the camera (résumé, contact card). */
export function Liftable({ object, page, view, anchor, canvasSize, size, fill = 0.84, hoverLabel, onFrame }: Props) {
  const current = useStore((s) => s.view)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const vp = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const home = useMemo(() => (object ? { p: object.position.clone(), q: object.quaternion.clone() } : null), [object])
  const corners = useMemo(() => (page ? uvCorners(page) : null), [page])
  const tween = useRef(new Tween([0]))

  const held = useMemo(() => {
    const aspect = vp.width / Math.max(1, vp.height)
    const shot = resolveShot(view, aspect)
    const fwd = new Vector3().subVectors(shot.target, shot.pos).normalize()
    const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize()
    const up = new Vector3().crossVectors(right, fwd).normalize()
    const tanV = Math.tan((shot.fov * DEG) / 2)
    const portrait = aspect < 0.85
    const dH = size[1] / (2 * tanV * fill)
    const dW = size[0] / (2 * tanV * aspect * 0.92)
    const d = portrait ? Math.max(dH * 0.8, dW) : Math.max(dH, dW)
    const pos = shot.pos.clone().addScaledVector(fwd, d + 0.004).addScaledVector(up, portrait ? -d * tanV * 0.08 : 0)
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, fwd.clone().negate(), up.clone().negate()))
    q.premultiply(new Quaternion().setFromAxisAngle(right, 2 * DEG))
    return { pos, q }
  }, [vp, view, size, fill])

  useEffect(() => {
    const up = current === view
    tween.current.retarget([up ? 1 : 0], reducedMotion ? 0 : up ? 0.9 : 0.7)
    if (up) emit('paper')
  }, [current, view, reducedMotion])

  useFrame((_, dt) => {
    if (!object || !home) return
    tween.current.update(Math.min(dt, 0.05))
    const k = Math.min(1, Math.max(0, tween.current.value[0]!))
    object.position.lerpVectors(home.p, held.pos, k)
    object.position.y += Math.sin(Math.PI * k) * 0.05
    object.quaternion.slerpQuaternions(home.q, held.q, smoothstep(0.05, 0.9, k))
    onFrame?.(k)
    if (page && corners) {
      publishQuad(anchor, page, corners, camera, vp.width, vp.height, canvasSize[0], canvasSize[1])
    }
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const s = useStore.getState()
    if (s.phase !== 'entered' || s.view === view) return
    s.setHover({ id: anchor, label: s.view === 'work' ? 'PUT DOWN NOTEPAD' : hoverLabel })
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    const s = useStore.getState()
    if (s.hover?.id === anchor) s.setHover(null)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const s = useStore.getState()
    if (s.phase !== 'entered' || s.view === view) return
    emit('ui:click')
    go(s.view === 'work' ? 'overview' : view)
  }
  if (!object) return null
  return <primitive object={object} onPointerOver={over} onPointerOut={out} onClick={click} />
}
