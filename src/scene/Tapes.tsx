import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three'
import { projects, type Project } from '../content/site'
import { canvasTexture, makeCanvas } from '../lib/canvas'
import { damp } from '../lib/anim'
import { emit } from '../lib/events'
import { go } from '../state/router'
import { useStore, type VcrStatus } from '../state/store'
import { registry } from './registry'
import { fillerStyle, tapeSpine, tapeTop, type TapeKind } from './screens/print'

const TAPE_H = 0.025
const TAPE_D = 0.103
const DESK_Y = 0.7604
const UP = new Vector3(0, 1, 0)

type Pose = { p: Vector3; q: Quaternion }
type Seg = {
  kind: 'fly' | 'slide' | 'slideOut' | 'drop' | 'home' | 'settle'
  from: Pose | null
  to: () => Pose
  dur: number
  t: number
  arc: number
  delay: number
  onDone?: () => void
}
type Where = 'stack' | 'air' | 'vcr' | 'desk'
type StackId = 'A' | 'B'

interface Tape {
  key: string
  project: Project | null
  index: number
  obj: Group
  proxy: Mesh
  shadow: Mesh
  home: StackId
  where: Where
  segs: Seg[]
  jitter: { dx: number; dz: number; yaw: number }
  pull: number
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

function blobTexture() {
  const { canvas, ctx } = makeCanvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62)
  g.addColorStop(0, 'rgba(0,0,0,0.85)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new CanvasTexture(canvas)
}

/** Default stack layout (bottom → top); p<n> = nth project, f<n> = filler tape.
 *  All projects sit in the front stack: the held notepad covers most of stack B in the work view. */
const LAYOUT: Record<StackId, string[]> = { A: ['f0', 'p2', 'p1', 'p0'], B: ['f2', 'f3', 'f1', 'f4', 'f5'] }

export function Tapes() {
  const sceneReady = useStore((s) => s.sceneReady)
  const template = registry.get<Group>('Tape')
  const built = useMemo(() => (sceneReady && template ? build(template) : null), [template, sceneReady])

  useEffect(() => {
    if (!built) return
    const root = registry.get('Tape')!.parent!
    for (const t of built.tapes) root.add(t.obj, t.shadow)
    return () => {
      for (const t of built.tapes) root.remove(t.obj, t.shadow)
    }
  }, [built])

  useFrame((_, dt) => built?.update(Math.min(dt, 0.05)))

  if (!built) return null
  return (
    <>
      {built.tapes
        .filter((t) => t.project)
        .map((t) => (
          <primitive
            key={t.key}
            object={t.proxy}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => built.hover(e, t, true)}
            onPointerOut={(e: ThreeEvent<PointerEvent>) => built.hover(e, t, false)}
            onClick={(e: ThreeEvent<MouseEvent>) => built.click(e, t)}
          />
        ))}
    </>
  )
}

function build(template: Group) {
  const stacks: Record<StackId, Tape[]> = { A: [], B: [] }
  const base: Record<StackId, Pose> = {
    A: poseOf(registry.get('Stack_A')) ?? { p: new Vector3(0.372, 0.76, 0.405), q: new Quaternion() },
    B: poseOf(registry.get('Stack_B')) ?? { p: new Vector3(0.588, 0.76, 0.345), q: new Quaternion() },
  }
  const mouthObj = registry.get('VCR_SlotMouth')
  const mouth = mouthObj ? mouthObj.getWorldPosition(new Vector3()) : new Vector3(-0.058, 0.808, 0.549)
  const door = registry.get('VCR_Door')
  const prePose: Pose = { p: new Vector3(mouth.x, mouth.y, mouth.z + TAPE_D / 2 + 0.035), q: new Quaternion() }
  const insidePose: Pose = { p: new Vector3(mouth.x, mouth.y, mouth.z - TAPE_D / 2 - 0.012), q: new Quaternion() }
  const deskPose: Pose = {
    p: new Vector3(-0.03, DESK_Y, 0.622),
    q: new Quaternion().setFromAxisAngle(UP, 0.13),
  }
  const blob = blobTexture()
  const winMat = new MeshStandardMaterial({ color: 0x050507, roughness: 0.08, envMapIntensity: 1.1 })
  const spoolMat = new MeshStandardMaterial({ color: '#d8d2c2', roughness: 0.55 })
  const proxyGeo = new BoxGeometry(0.2, TAPE_H + 0.006, TAPE_D + 0.012)
  proxyGeo.translate(0, TAPE_H / 2, 0)
  const proxyMat = new MeshBasicMaterial({ visible: false })

  const tapes: Tape[] = []
  let rngSeed = 3
  const rnd = () => ((rngSeed = (rngSeed * 16807) % 2147483647) / 2147483647)
  for (const sid of ['A', 'B'] as StackId[]) {
    for (const slot of LAYOUT[sid]) {
      const n = Number(slot.slice(1))
      const project = slot[0] === 'p' ? projects[n] ?? null : null
      const kind: TapeKind = project ? { project, index: projects.indexOf(project) } : { filler: n }
      const obj = template.clone(true)
      obj.visible = true
      obj.name = project ? `Tape:${project.id}` : `Tape:filler${n}`
      const shellColor = project ? project.tape.shell : fillerStyle(n).shell
      const spine = canvasTexture(tapeSpine(kind))
      const top = canvasTexture(tapeTop(kind))
      obj.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh) return
        m.castShadow = true
        m.receiveShadow = true
        const nm = owner(m)
        if (nm.startsWith('Tape_Shell')) m.material = new MeshStandardMaterial({ color: shellColor, roughness: 0.42, envMapIntensity: 0.55 })
        else if (nm.startsWith('Tape_Window')) m.material = winMat
        else if (nm.startsWith('Tape_Spine')) m.material = new MeshStandardMaterial({ map: spine, roughness: 0.78, envMapIntensity: 0.25 })
        else if (nm.startsWith('Tape_TopLabel')) m.material = new MeshStandardMaterial({ map: top, roughness: 0.8, envMapIntensity: 0.2 })
        else if (nm.startsWith('Tape_Spool')) m.material = spoolMat
      })
      const proxy = new Mesh(proxyGeo, proxyMat)
      proxy.name = `TapeProxy:${obj.name}`
      const shadow = new Mesh(new PlaneGeometry(0.24, 0.15), new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0, side: DoubleSide }))
      shadow.rotation.x = -Math.PI / 2
      shadow.renderOrder = 1
      const t: Tape = {
        key: obj.name,
        project,
        index: project ? projects.indexOf(project) : -1,
        obj,
        proxy,
        shadow,
        home: sid,
        where: 'stack',
        segs: [],
        jitter: { dx: (rnd() - 0.5) * 0.008, dz: (rnd() - 0.5) * 0.008, yaw: (rnd() - 0.5) * 0.06 },
        pull: 0,
      }
      stacks[sid].push(t)
      tapes.push(t)
    }
  }

  const slotPose = (sid: StackId, i: number, t: Tape): Pose => {
    const b = base[sid]
    const off = new Vector3(t.jitter.dx, i * (TAPE_H + 0.0004), t.jitter.dz).applyQuaternion(b.q)
    return { p: b.p.clone().add(off), q: b.q.clone().multiply(new Quaternion().setFromAxisAngle(UP, t.jitter.yaw)) }
  }
  /** live target: wherever this tape currently belongs in its stack */
  const stackPose = (t: Tape) => slotPose(t.home, Math.max(0, stacks[t.home].indexOf(t)), t)
  for (const sid of ['A', 'B'] as StackId[]) stacks[sid].forEach((t, i) => applyPose(t.obj, slotPose(sid, i, t)))

  const vcr = { tape: null as Tape | null, inserting: null as Tape | null, status: 'empty' as VcrStatus, timer: 0, cooldown: 0 }
  const publish = () => useStore.getState().setVcr({ tape: vcr.tape?.project?.id ?? null, status: vcr.status })

  const seg = (kind: Seg['kind'], to: () => Pose, dur: number, arc = 0, delay = 0, onDone?: () => void): Seg => ({
    kind, from: null, to, dur, t: 0, arc, delay, onDone,
  })

  const reduced = () => useStore.getState().reducedMotion

  const removeFromStack = (t: Tape) => {
    const s = stacks[t.home]
    const i = s.indexOf(t)
    if (i < 0) return
    s.splice(i, 1)
    for (let j = i; j < s.length; j++) {
      const above = s[j]!
      if (above.where === 'stack') above.segs.push(seg('settle', () => stackPose(above), reduced() ? 0 : 0.32, 0, 0.1))
    }
  }

  const sendHome = (t: Tape, delay = 0) => {
    stacks[t.home].push(t)
    t.where = 'air'
    t.segs = [seg('home', () => stackPose(t), reduced() ? 0 : 0.75, 0.1, delay, () => (t.where = 'stack'))]
  }

  const startInsert = (t: Tape) => {
    if (t.where === 'stack') removeFromStack(t)
    t.where = 'air'
    vcr.status = 'inserting'
    vcr.inserting = t
    publish()
    emit('tape:lift')
    const r = reduced()
    t.segs = [
      seg('fly', () => prePose, r ? 0 : 0.85, 0.12, vcr.cooldown),
      seg('slide', () => insidePose, r ? 0 : 0.42, 0, 0, () => {
        t.where = 'vcr'
        vcr.tape = t
        vcr.inserting = null
        vcr.status = 'loading'
        vcr.timer = r ? 0.35 : 0.95
        publish()
        emit('tape:insert')
        emit('tv:static')
      }),
    ]
    vcr.cooldown = 0
  }

  const startEject = () => {
    const t = vcr.tape
    if (!t) return
    vcr.status = 'ejecting'
    publish()
    emit('tape:eject')
    const prev = tapes.find((x) => x.where === 'desk')
    if (prev) sendHome(prev)
    const r = reduced()
    t.where = 'air'
    t.segs = [
      seg('slideOut', () => prePose, r ? 0 : 0.45, 0, 0.12, () => {
        vcr.tape = null
        vcr.status = 'empty'
        vcr.cooldown = r ? 0 : 0.3
        publish()
      }),
      seg('drop', () => deskPose, r ? 0 : 0.6, 0.05, 0, () => {
        t.where = 'desk'
        emit('tape:drop')
      }),
    ]
  }

  const tmpP = new Vector3()
  const euler = new Euler()
  const doorAngle = { v: 0 }

  function update(dt: number) {
    const s = useStore.getState()
    const want = s.phase === 'entered' ? s.project : null

    // abort an insert whose request changed while the tape is still in the air
    if (vcr.status === 'inserting' && vcr.inserting && vcr.inserting.project?.id !== want) {
      const t = vcr.inserting
      if (t.segs[0]?.kind === 'fly') {
        vcr.inserting = null
        vcr.status = 'empty'
        publish()
        sendHome(t)
      }
    }
    if (vcr.status === 'empty' && want) {
      const t = tapes.find((x) => x.project?.id === want)
      if (t && (t.where === 'stack' || t.where === 'desk' || (t.where === 'air' && t.segs[0]?.kind === 'home'))) {
        // it may be flying home: re-route straight to the VCR (tapes above it settle smoothly)
        if (t.where === 'air') removeFromStack(t)
        startInsert(t)
      }
    }
    if ((vcr.status === 'playing' || vcr.status === 'loading') && vcr.tape?.project?.id !== want) startEject()
    if (vcr.status === 'loading') {
      vcr.timer -= dt
      if (vcr.timer <= 0) {
        vcr.status = 'playing'
        publish()
        emit('tv:play')
      }
    }

    for (const t of tapes) {
      // hover pull (project tapes resting in a stack)
      const hovered = s.hover?.id === `tape:${t.project?.id}` && t.where === 'stack' && !t.segs.length
      t.pull = damp(t.pull, hovered ? 1 : 0, 12, dt)
      const sg = t.segs[0]
      if (sg) {
        if (sg.delay > 0) sg.delay -= dt
        else {
          if (!sg.from) sg.from = { p: t.obj.position.clone(), q: t.obj.quaternion.clone() }
          sg.t = sg.dur <= 0 ? 1 : Math.min(1, sg.t + dt / sg.dur)
          const k = sg.kind === 'slide' || sg.kind === 'slideOut' ? sg.t * sg.t * (3 - 2 * sg.t) : smoother(sg.t)
          const to = sg.to()
          tmpP.lerpVectors(sg.from.p, to.p, k)
          tmpP.y += Math.sin(Math.PI * k) * sg.arc
          t.obj.position.copy(tmpP)
          t.obj.quaternion.slerpQuaternions(sg.from.q, to.q, k)
          if (sg.t >= 1) {
            t.segs.shift()
            sg.onDone?.()
          }
        }
      } else if (t.where === 'stack') {
        const pose = stackPose(t)
        t.obj.position.copy(pose.p).addScaledVector(new Vector3(0, 0, 1).applyQuaternion(pose.q), t.pull * 0.014)
        t.obj.quaternion.copy(pose.q)
      }
      t.proxy.position.copy(t.obj.position)
      t.proxy.quaternion.copy(t.obj.quaternion)
      // soft contact shadow when the tape is on (or near) the desk outside the baked stacks
      const h = t.obj.position.y - DESK_Y
      const show = t.where !== 'stack' && t.where !== 'vcr' && Math.abs(t.obj.position.z - mouth.z) > 0.02
      const mat = t.shadow.material as MeshBasicMaterial
      mat.opacity = damp(mat.opacity, show ? Math.max(0, 0.55 * (1 - h / 0.2)) : 0, 10, dt)
      t.shadow.visible = mat.opacity > 0.01
      t.shadow.position.set(t.obj.position.x, DESK_Y + 0.0008, t.obj.position.z)
      euler.setFromQuaternion(t.obj.quaternion, 'YXZ')
      t.shadow.rotation.set(-Math.PI / 2, 0, euler.y)
      const sc = 1 + h * 2.5
      t.shadow.scale.set(sc, sc, 1)
    }

    // VCR door swings in while a tape passes through the mouth
    let open = 0
    for (const t of tapes) {
      const back = t.obj.position.z - TAPE_D / 2
      const front = t.obj.position.z + TAPE_D / 2
      const nearX = Math.abs(t.obj.position.x - mouth.x) < 0.05 && Math.abs(t.obj.position.y - mouth.y) < 0.03
      if (nearX && back < mouth.z + 0.012 && front > mouth.z - 0.004) open = 1
    }
    const prev = doorAngle.v
    doorAngle.v = damp(doorAngle.v, open, 16, dt)
    if (prev < 0.5 !== doorAngle.v < 0.5) emit('vcr:door')
    if (door) door.rotation.x = doorAngle.v * 1.25
  }

  function hover(e: ThreeEvent<PointerEvent>, t: Tape, over: boolean) {
    e.stopPropagation()
    const s = useStore.getState()
    if (s.phase !== 'entered' || !t.project) return
    if (over) {
      s.setHover({ id: `tape:${t.project.id}`, label: `PLAY · ${t.project.short.toUpperCase()}` })
      document.body.style.cursor = 'pointer'
    } else if (s.hover?.id === `tape:${t.project.id}`) {
      s.setHover(null)
      document.body.style.cursor = ''
    }
  }

  function click(e: ThreeEvent<MouseEvent>, t: Tape) {
    e.stopPropagation()
    const s = useStore.getState()
    if (s.phase !== 'entered' || !t.project) return
    emit('ui:click')
    go('work', t.project.id)
  }

  return { tapes, update, hover, click }
}

function owner(o: Object3D): string {
  let p: Object3D | null = o
  while (p) {
    if (p.name.startsWith('Tape_')) return p.name
    p = p.parent
  }
  return ''
}

function poseOf(o: Object3D | undefined): Pose | null {
  if (!o) return null
  o.updateWorldMatrix(true, false)
  const p = new Vector3()
  const q = new Quaternion()
  o.matrixWorld.decompose(p, q, new Vector3())
  return { p, q }
}

function applyPose(o: Object3D, pose: Pose) {
  o.position.copy(pose.p)
  o.quaternion.copy(pose.q)
}
