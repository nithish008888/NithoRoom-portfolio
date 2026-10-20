import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  CubeCamera,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  HalfFloatType,
  LinearMipmapLinearFilter,
  Object3D,
  PMREMGenerator,
  RectAreaLight,
  SpotLight,
  Vector3,
  WebGLCubeRenderTarget,
} from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { projectById, projects } from '../content/site'
import { damp } from '../lib/anim'
import { useStore, type VcrStatus } from '../state/store'
import { envReceivers, mats } from './Room'
import { registry } from './registry'
import { screens } from './screens'
import type { TVMode } from './screens/tv'

RectAreaLightUniformsLib.init()

const ENV_POS = new Vector3(0.05, 1.05, 0.55)

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
  const glow = useRef(new Color('#3a5cff'))
  const staticAmt = useRef(0)
  const lastMode = useRef<TVMode>('loading')
  const burst = useRef(0)
  const captured = useRef(0)

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
    scene.add(spot, spotTarget, rect, pcGlow)
    return () => {
      scene.remove(spot, spotTarget, rect, pcGlow)
    }
  }, [scene, spot, spotTarget, rect, pcGlow])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useStore.getState()

    // one-time capture of the lit room for reflections (after textures are on the GPU)
    if (captured.current < 4) {
      captured.current++
      if (captured.current === 4) {
        const rt = new WebGLCubeRenderTarget(256, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter })
        const cam = new CubeCamera(0.03, 40, rt)
        cam.position.copy(ENV_POS)
        scene.add(cam)
        cam.update(gl, scene)
        scene.remove(cam)
        const pmrem = new PMREMGenerator(gl)
        const env = pmrem.fromCubemap(rt.texture).texture
        pmrem.dispose()
        // three.js only honours a material's envMapIntensity when the material has its own envMap
        // (with scene.environment it uses scene.environmentIntensity) — so assign it explicitly
        scene.traverse((o) => {
          const mm = (o as Mesh).material as Material | Material[] | undefined
          for (const m of Array.isArray(mm) ? mm : mm ? [mm] : []) {
            if ((m as MeshStandardMaterial).isMeshStandardMaterial) {
              ;(m as MeshStandardMaterial).envMap = env
              m.needsUpdate = true
            }
          }
        })
        // anything created later (cloned tapes, cards) falls back to a gentle scene environment
        scene.environment = env
        scene.environmentIntensity = 0.3
        for (const m of envReceivers) {
          m.uniforms.uEnv!.value = rt.texture
          m.uniforms.uHasEnv!.value = 1
        }
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
      <directionalLight position={[-0.1, 1.9, -1.5]} intensity={0.22} color="#8aa0ff" />
      <hemisphereLight args={['#ffc98f', '#3a2614', 0.55]} />
    </>
  )
}
