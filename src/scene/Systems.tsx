import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  CubeCamera,
  type DirectionalLight,
  type HemisphereLight,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  HalfFloatType,
  LinearMipmapLinearFilter,
  Object3D,
  PMREMGenerator,
  PointLight,
  RectAreaLight,
  SpotLight,
  type Texture,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderTarget,
} from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { projectById, projects } from '../content/site'
import { damp } from '../lib/anim'
import { useStore, type VcrStatus } from '../state/store'
import { gains, levels, lightsSettling, updateLighting } from './lighting'
import { swayTime } from './materials/baked'
import { envReceivers, mats } from './Room'
import { registry } from './registry'
import { screens } from './screens'
import type { TVMode } from './screens/tv'

RectAreaLightUniformsLib.init()

const ENV_POS = new Vector3(0.05, 1.05, 0.55)
// the wall tube light (Blender (-1.69, -1.15, 2.1) -> three (x, z, -y)), for objects that move
const TUBE_POS = new Vector3(-1.66, 2.06, 1.15)
const HEMI_SKY = new Color('#ffc98f')
const HEMI_SKY_TUBE = new Color('#eef2ff')
const TUBE_GLOW_OFF = new Color(0.06, 0.062, 0.065)
const TUBE_GLOW_ON = new Color(2.6, 2.75, 3.0)

function tvMode(phase: string, view: string, status: VcrStatus): TVMode {
  if (phase === 'loading') return 'loading'
  if (phase === 'ready') return 'ready'
  if (status === 'loading') return 'static'
  if (status === 'playing') return 'program'
  if (status === 'ejecting') return 'eject'
  if (status === 'inserting') return 'insert'
  return view === 'work' ? 'pick' : 'title'
}

/** Realtime lights (for moving objects), environment capture and screen updates. */
export function Systems() {
  const { gl, scene } = useThree()
  const spot = useMemo(() => new SpotLight('#ffb36e', 1.1, 0, 1.22, 0.9, 2), [])
  const spotTarget = useMemo(() => new Object3D(), [])
  const rect = useMemo(() => new RectAreaLight('#3a5cff', 0.3, 0.3, 0.23), [])
  const pcGlow = useMemo(() => new RectAreaLight('#5dff8a', 0.12, 0.26, 0.2), [])
  const tubeLight = useMemo(() => new PointLight('#e8eeff', 0, 0, 2), [])
  const hemi = useRef<HemisphereLight>(null)
  const night = useRef<DirectionalLight>(null)
  const glow = useRef(new Color('#3a5cff'))
  const staticAmt = useRef(0)
  const lastMode = useRef<TVMode>('loading')
  const burst = useRef(0)
  const captured = useRef(0)
  // reflections: captured once the room has drawn, again whenever a light has been switched and settled
  const env = useRef<{ rt: WebGLCubeRenderTarget; cam: CubeCamera; pmrem: PMREMGenerator; target: WebGLRenderTarget } | null>(null)
  const relight = useRef({ dirty: false, quiet: 0, lamp: 1, tube: 0 })

  const capture = () => {
    if (!env.current) {
      const rt = new WebGLCubeRenderTarget(256, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter })
      const cam = new CubeCamera(0.03, 40, rt)
      cam.position.copy(ENV_POS)
      const pmrem = new PMREMGenerator(gl)
      cam.update(gl, scene)
      const target = pmrem.fromCubemap(rt.texture)
      env.current = { rt, cam, pmrem, target }
      return target.texture as Texture
    }
    const e = env.current
    // the glass and the CRT reflect this cube map: unbind it while drawing into it (no feedback loop)
    for (const m of envReceivers) m.uniforms.uEnv!.value = null
    e.cam.update(gl, scene)
    for (const m of envReceivers) m.uniforms.uEnv!.value = e.rt.texture
    e.pmrem.fromCubemap(e.rt.texture, e.target) // same texture object: every material keeps it
    return e.target.texture as Texture
  }

  useLayoutEffect(() => {
    const lamp = registry.get('LampLight')
    const aim = registry.get('LampAim')
    if (lamp) spot.position.copy(lamp.getWorldPosition(new Vector3()))
    else spot.position.set(-0.45, 1.13, 0.4)
    if (aim) spotTarget.position.copy(aim.getWorldPosition(new Vector3()))
    else spotTarget.position.set(0.05, 0.76, 0.58)
    spot.target = spotTarget
    spot.castShadow = true
    spot.shadow.mapSize.set(1024, 1024)
    spot.shadow.bias = -0.0004
    spot.shadow.normalBias = 0.015
    spot.shadow.radius = 4
    spot.shadow.camera.near = 0.04
    spot.shadow.camera.far = 3
    const glowAt = registry.get('TVGlow')
    const p = glowAt ? glowAt.getWorldPosition(new Vector3()) : new Vector3(0.022, 1.073, 0.5)
    rect.position.copy(p).add(new Vector3(0, 0, 0.012))
    rect.lookAt(p.x, p.y - 0.05, p.z + 1)
    // terminal screen (Computer group at Blender (-1.45, -1.12) turned to face +X)
    pcGlow.position.set(-1.36, 1.045, 1.12)
    pcGlow.lookAt(0, 1.0, 1.12)
    tubeLight.position.copy(TUBE_POS)
    scene.add(spot, spotTarget, rect, pcGlow, tubeLight)
    return () => {
      scene.remove(spot, spotTarget, rect, pcGlow, tubeLight)
    }
  }, [scene, spot, spotTarget, rect, pcGlow, tubeLight])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useStore.getState()

    // switchable lights: lamp, wall tube, lightning (layer weights of the baked room + the realtime lights)
    updateLighting(dt)
    const { lamp, tube, flash } = levels
    spot.intensity = 1.1 * lamp
    spot.shadow.autoUpdate = lamp > 0.01
    tubeLight.intensity = 1.6 * tube * gains.tube
    if (hemi.current) {
      hemi.current.intensity = 0.55 + 0.5 * tube
      hemi.current.color.copy(HEMI_SKY).lerp(HEMI_SKY_TUBE, tube * 0.7)
    }
    if (night.current) night.current.intensity = 0.22 * (1 + flash * 14)
    for (const g of mats.lampGlow) g.m.emissiveIntensity = g.full * lamp * lamp
    mats.tube?.color.copy(TUBE_GLOW_OFF).lerp(TUBE_GLOW_ON, tube)
    if (mats.glass) mats.glass.uniforms.uFlash!.value = flash
    if (!s.reducedMotion) {
      swayTime.value += dt
      if (mats.fairy) mats.fairy.uniforms.uTime.value += dt
    }

    // capture of the lit room for reflections (after textures are on the GPU)
    if (captured.current < 4) {
      captured.current++
      if (captured.current === 4) {
        const envTex = capture()
        // three.js only honours a material's envMapIntensity when the material has its own envMap
        // (with scene.environment it uses scene.environmentIntensity) — so assign it explicitly
        scene.traverse((o) => {
          const mm = (o as Mesh).material as Material | Material[] | undefined
          for (const m of Array.isArray(mm) ? mm : mm ? [mm] : []) {
            if ((m as MeshStandardMaterial).isMeshStandardMaterial && !(m as MeshStandardMaterial).envMap) {
              ;(m as MeshStandardMaterial).envMap = envTex
              m.needsUpdate = true
            }
          }
        })
        // anything created later (cloned tapes, cards) falls back to a gentle scene environment
        scene.environment = envTex
        scene.environmentIntensity = 0.3
        for (const m of envReceivers) {
          m.uniforms.uEnv!.value = env.current!.rt.texture
          m.uniforms.uHasEnv!.value = 1
        }
      }
    } else {
      // a light was switched: once it has settled (and no lightning is in the air), capture the room again
      const r = relight.current
      if (Math.abs(lamp - r.lamp) > 0.01 || Math.abs(tube - r.tube) > 0.01) r.dirty = true
      r.quiet = lightsSettling() || flash > 0.002 ? 0 : r.quiet + dt
      if (r.dirty && r.quiet > 0.25) {
        r.dirty = false
        r.lamp = lamp
        r.tube = tube
        capture()
      }
    }

    // television
    const tv = screens.tv
    tv.progress = s.progress
    tv.sound = s.sound
    tv.music = s.music.playing
    const mode = tvMode(s.phase, s.view, s.vcr.status)
    if (mode !== lastMode.current) {
      if (mode === 'program' || mode === 'eject' || lastMode.current === 'ready') burst.current = 0.28
      lastMode.current = mode
    }
    tv.setMode(mode)
    // while a tape travels to the deck, the TV/VFD already show which one is coming
    const p = projectById(s.vcr.tape ?? (s.vcr.status === 'inserting' ? s.project : null))
    tv.project = p
    tv.tapeNumber = p ? projects.indexOf(p) + 1 : 0
    tv.update(dt)
    burst.current = Math.max(0, burst.current - dt)
    const targetStatic = mode === 'static' ? 1 : burst.current > 0 ? 0.65 : 0
    staticAmt.current = damp(staticAmt.current, targetStatic, 14, dt)
    const crt = mats.crt
    if (crt) {
      crt.uniforms.uTime!.value += dt
      crt.uniforms.uStatic!.value = staticAmt.current
    }
    if (mats.glass && !s.reducedMotion) mats.glass.uniforms.uTime!.value += dt
    if (mats.pc) mats.pc.uniforms.uTime!.value += dt
    screens.vfd.update(s.vcr.status, tv.tapeNumber, performance.now() / 1000)

    // CRT spill light follows the picture colour (restrained)
    const g = tv.glow
    glow.current.r = damp(glow.current.r, g.r, 4, dt)
    glow.current.g = damp(glow.current.g, g.g, 4, dt)
    glow.current.b = damp(glow.current.b, g.b, 4, dt)
    rect.color.copy(glow.current)
    rect.intensity = 0.32 * g.i * (mode === 'static' ? 0.8 : 1)
  })

  return (
    <>
      {/* cool night fill from the window and a warm room fill, for objects that move */}
      <directionalLight ref={night} position={[-0.1, 1.9, -1.5]} intensity={0.22} color="#8aa0ff" />
      <hemisphereLight ref={hemi} args={['#ffc98f', '#3a2614', 0.55]} />
    </>
  )
}
