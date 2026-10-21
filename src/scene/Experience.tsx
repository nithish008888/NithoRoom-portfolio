import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Box3, DefaultLoadingManager, PCFShadowMap, Vector3 } from 'three'
import { Suspense, useEffect, useRef } from 'react'
import type { Mesh } from 'three'
import { backToDesk } from '../state/router'
import { useStore } from '../state/store'
import { anchors, publishQuad, uvCorners } from './anchors'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'
import { Hotspots } from './Hotspots'
import { Notepad } from './Notepad'
import { registry } from './registry'
import { Room } from './Room'
import { Systems } from './Systems'
import { Tapes } from './Tapes'
import { Terminal } from './Terminal'
import { Papers } from './Papers'
import { CDPlayerLCD } from './CDPlayer'
import { SpotAnchors } from './SpotAnchors'
import { Guard } from './Guard'
import { Speakers } from './Speakers'
import { Avatar } from './Avatar'
import { LightControls } from './LightControls'
import { Ambience } from './Ambience'

/** Signals "ready" once everything is loaded and shaders are compiled. */
function Ready() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    gl.compile(scene, camera)
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const s = useStore.getState()
        if (s.phase === 'loading') s.set({ phase: 'ready', progress: 1 })
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [gl, scene, camera])
  return null
}

/** Publishes the TV screen quad so DOM overlays (entry buttons) can sit on it. */
function ScreenAnchors() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const sceneReady = useStore((s) => s.sceneReady)
  const corners = useRef<ReturnType<typeof uvCorners> | null>(null)
  useFrame(() => {
    const tv = registry.get<Mesh>('TV_ScreenMesh')
    if (!sceneReady || !tv) return
    corners.current ??= uvCorners(tv)
    publishQuad('tv', tv, corners.current, camera, size.width, size.height, 1024, 780)
  })
  return null
}

function ProgressBridge() {
  useEffect(() => {
    // report loader progress outside React's render phase
    DefaultLoadingManager.onProgress = (_url, loaded, total) =>
      queueMicrotask(() => {
        const s = useStore.getState()
        if (s.phase === 'loading') s.set({ progress: Math.min(0.99, loaded / Math.max(1, total)) })
      })
  }, [])
  return null
}

export function Experience() {
  const lowPower = useStore((s) => s.lowPower)
  return (
    <Canvas
      className="stage"
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 40, near: 0.03, far: 150, position: [0.03, 1.08, 1.12] }}
      shadows={{ enabled: true, type: PCFShadowMap }}
      flat
      onCreated={({ gl, scene, camera }) => {
        gl.toneMappingExposure = 1.55
        const w = window as unknown as { __room?: Record<string, unknown> }
        if (w.__room) {
          w.__room.three = { gl, scene, camera }
          // screen position of a named object (used by the screenshot/demo scripts);
          // front = centre of the face towards the room, e.g. a tape's spine inside a stack
          w.__room.screenOf = (name: string, front = false) => {
            const o = registry.get(name) ?? scene.getObjectByName(name)
            if (!o) return null
            const b = new Box3().setFromObject(o)
            const c = b.getCenter(new Vector3())
            if (front) c.z = b.max.z
            c.project(camera)
            return { x: ((c.x + 1) / 2) * gl.domElement.clientWidth, y: ((1 - c.y) / 2) * gl.domElement.clientHeight }
          }
        }
      }}
      onPointerMissed={() => {
        const s = useStore.getState()
        if (s.phase === 'entered' && s.view === 'work') backToDesk()
      }}
    >
      <color attach="background" args={['#07080d']} />
      <ProgressBridge />
      <Suspense fallback={null}>
        <Room />
        <Systems />
        <Tapes />
        <Notepad />
        <Papers />
        <Terminal />
        <CDPlayerLCD />
        <Speakers />
        <LightControls />
        <Ambience />
        <Hotspots />
        <SpotAnchors />
        <ScreenAnchors />
        <Effects />
        <Ready />
      </Suspense>
      <AvatarWhenReady />
      <CameraRig />
      <Guard />
    </Canvas>
  )
}

/** The seated character only shows in the About corner: load it after the room, without holding up entry. */
function AvatarWhenReady() {
  const ready = useStore((s) => s.phase !== 'loading' && s.sceneReady)
  return ready ? (
    <Suspense fallback={null}>
      <Avatar />
    </Suspense>
  ) : null
}

export { anchors }
