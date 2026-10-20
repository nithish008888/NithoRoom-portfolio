import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { Tween, damp } from '../lib/anim'
import { useStore } from '../state/store'
import { resolveShot, type ShotKey } from './shots'

const tmp = new Vector3()

/** Seconds for a move: proportional to travel + turn, inside the reference's ~1–2 s pacing. */
function durationFor(fromPos: Vector3, fromTarget: Vector3, toPos: Vector3, toTarget: Vector3, entering: boolean) {
  if (entering) return 2.6
  const d = fromPos.distanceTo(toPos)
  const a = tmp.subVectors(fromTarget, fromPos).normalize().angleTo(new Vector3().subVectors(toTarget, toPos).normalize())
  return Math.min(2.1, Math.max(0.95, 0.85 + d * 0.65 + a * 0.45))
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const view = useStore((s) => s.view)
  const phase = useStore((s) => s.phase)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const aspect = size.width / Math.max(1, size.height)
  const aspectBucket = aspect < 0.85 ? 'portrait' : `l${Math.round(aspect * 10)}`

  const shotKey: ShotKey = phase === 'entered' || phase === 'entering' ? view : 'loading'
  const initial = useMemo(() => resolveShot('loading', aspect), []) // eslint-disable-line react-hooks/exhaustive-deps
  const tween = useRef(new Tween([...initial.pos.toArray(), ...initial.target.toArray(), initial.fov]))
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 })
  const lastKey = useRef<ShotKey>('loading')

  useEffect(() => {
    const shot = resolveShot(shotKey, aspect)
    const t = tween.current
    const v = t.value
    const fromPos = new Vector3(v[0], v[1], v[2])
    const fromTarget = new Vector3(v[3], v[4], v[5])
    const keyChanged = lastKey.current !== shotKey
    const entering = lastKey.current === 'loading' && shotKey !== 'loading'
    lastKey.current = shotKey
    let dur = keyChanged ? durationFor(fromPos, fromTarget, shot.pos, shot.target, entering) : 0.6
    if (reducedMotion) {
      dur = 0
      if (keyChanged) document.body.dispatchEvent(new CustomEvent('cutfade'))
    }
    t.retarget([...shot.pos.toArray(), ...shot.target.toArray(), shot.fov], dur)
    useStore.getState().set({ moving: dur > 0 })
  }, [shotKey, aspectBucket, reducedMotion]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    const t = tween.current
    const wasActive = t.active
    t.update(dt)
    if (wasActive && !t.active) useStore.getState().set({ moving: false })
    const v = t.value
    // a very small pointer parallax on the overview only — calm, never while reading
    const p = pointer.current
    const allow = shotKey === 'overview' && !reducedMotion && !t.active
    p.sx = damp(p.sx, allow ? p.x : 0, 2.2, dt)
    p.sy = damp(p.sy, allow ? p.y : 0, 2.2, dt)
    camera.position.set(v[0]! + p.sx * 0.018, v[1]! - p.sy * 0.01, v[2]!)
    camera.lookAt(v[3]! + p.sx * 0.006, v[4]! - p.sy * 0.004, v[5]!)
    if (Math.abs(camera.fov - v[6]!) > 1e-4) {
      camera.fov = v[6]!
      camera.updateProjectionMatrix()
    }
  })
  return null
}
