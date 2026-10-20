import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D, type PerspectiveCamera } from 'three'
import { projectById, projects } from '../content/site'
import { Tween, smoothstep } from '../lib/anim'
import { emit } from '../lib/events'
import { go } from '../state/router'
import { useStore } from '../state/store'
import { anchors, publishQuad, uvCorners } from './anchors'
import { registry } from './registry'
import { screens } from './screens'
import { PAGE_H, PAGE_W } from './screens/notepad'
import { resolveShot } from './shots'

const DEG = Math.PI / 180
const PAD_W = 0.216
const PAD_L = 0.3

/** Where the notepad is held in front of the Work camera (computed from the final shot, not the moving camera). */
function heldPose(aspect: number) {
  const shot = resolveShot('work', aspect)
  const fwd = new Vector3().subVectors(shot.target, shot.pos).normalize()
  const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize()
  const up = new Vector3().crossVectors(right, fwd).normalize()
  const tanV = Math.tan((shot.fov * DEG) / 2)
  const portrait = aspect < 0.85
  let d: number
  let x: number
  let y: number
  if (!portrait) {
    d = PAD_L / (2 * tanV * 0.86)
    x = d * tanV * aspect * 0.95 - (PAD_W / 2) * 1.04
    y = -0.006
  } else {
    d = PAD_W / (2 * tanV * aspect * 0.94)
    x = 0
    y = -(d * tanV - PAD_L / 2 - d * tanV * 0.04)
  }
  const pos = shot.pos.clone().addScaledVector(fwd, d).addScaledVector(right, x).addScaledVector(up, y)
  // local X -> right, local Y (page normal) -> towards camera, local Z -> down (binding on top)
  const m = new Matrix4().makeBasis(right, fwd.clone().negate(), up.clone().negate())
  const q = new Quaternion().setFromRotationMatrix(m)
  // a slight hand-held angle
  q.premultiply(new Quaternion().setFromAxisAngle(up, portrait ? 0 : -5 * DEG))
  q.premultiply(new Quaternion().setFromAxisAngle(right, 2.5 * DEG))
  // the group origin is the bottom of the pad: push it back so the page sits at distance d
  pos.addScaledVector(fwd, 0.011)
  return { pos, q }
}

export function Notepad() {
  const sceneReady = useStore((s) => s.sceneReady)
  const pad = registry.get('Notepad')
  const page = registry.get<Mesh>('Notepad_PageMesh')
  const view = useStore((s) => s.view)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const home = useMemo(() => (sceneReady && pad ? { pos: pad.position.clone(), q: pad.quaternion.clone() } : null), [pad, sceneReady])
  const corners = useMemo(() => (sceneReady && page ? uvCorners(page) : null), [page, sceneReady])
  const tween = useRef(new Tween([0]))
  const held = useRef(heldPose(size.width / size.height))
  const was = useRef(false)

  useEffect(() => {
    held.current = heldPose(size.width / Math.max(1, size.height))
  }, [size])

  useEffect(() => {
    const up = view === 'work'
    if (up !== was.current) emit(up ? 'notepad:lift' : 'notepad:down')
    was.current = up
    tween.current.retarget([up ? 1 : 0], reducedMotion ? 0 : up ? 0.95 : 0.75)
  }, [view, reducedMotion])

  const tmp = useMemo(() => ({ p: new Vector3(), q: new Quaternion(), upv: new Vector3() }), [])

  useFrame((_, dt) => {
    if (!pad || !home) return
    const t = tween.current
    t.update(Math.min(dt, 0.05))
    const k = Math.min(1, Math.max(0, t.value[0]!))
    const h = held.current
    tmp.p.lerpVectors(home.pos, h.pos, k)
    tmp.p.y += Math.sin(Math.PI * k) * 0.05
    // rotate a little late so the pad lifts before it turns to face you
    const kr = smoothstep(0.08, 0.92, k)
    tmp.q.slerpQuaternions(home.q, h.q, kr)
    pad.position.copy(tmp.p)
    pad.quaternion.copy(tmp.q)
    const mat = page?.material as MeshStandardMaterial | undefined
    if (mat) mat.emissiveIntensity = 0.1 * smoothstep(0.55, 1, k)

    // page content
    const s = useStore.getState()
    const selected = projectById(s.project)
    const st = s.vcr.status
    const tapeNo = selected ? `tape ${String(projects.indexOf(selected) + 1).padStart(2, '0')}` : ''
    const status = !selected
      ? 'pick a tape'
      : st === 'playing' && s.vcr.tape === selected.id
        ? `${tapeNo} · now playing`
        : st === 'ejecting'
          ? `${tapeNo} · ejecting…`
          : `${tapeNo} · loading…`
    const hov = s.hover?.id ?? null
    screens.notepad.render({ selected, status, hover: hov?.startsWith('page:') ? hov.slice(5) : null, focus: s.focus?.startsWith('page:') ? s.focus.slice(5) : null })

    if (page && corners) {
      publishQuad('notepad', page, corners, camera, size.width, size.height, PAGE_W, PAGE_H)
      const a = anchors.get('notepad')
      if (a) a.visible = a.visible && k > 0.97
    }
  })

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const s = useStore.getState()
    if (s.phase !== 'entered' || s.view === 'work') return
    s.setHover({ id: 'notepad', label: 'PICK UP NOTEPAD · WORK' })
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    const s = useStore.getState()
    if (s.hover?.id === 'notepad') s.setHover(null)
    document.body.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const s = useStore.getState()
    if (s.phase !== 'entered' || s.view === 'work') return
    emit('ui:click')
    go('work', s.project)
  }

  if (!pad) return null
  return <primitive object={pad as Object3D} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} />
}

