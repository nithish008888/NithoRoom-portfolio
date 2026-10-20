import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { useStore } from '../state/store'
import { publishQuad, uvCorners } from './anchors'
import { makeCRT } from './materials/crt'
import { envReceivers, mats } from './Room'
import { registry } from './registry'
import { Terminal as TerminalScreen } from './screens/terminal'

export const terminal = new TerminalScreen()

/** Green-phosphor screen on the old computer (About). */
export function Terminal() {
  const sceneReady = useStore((s) => s.sceneReady)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const screen = sceneReady ? registry.get<Mesh>('PC_ScreenMesh') : undefined
  const corners = useMemo(() => (screen ? uvCorners(screen) : null), [screen])
  const shown = useRef(false)

  useEffect(() => {
    if (!screen) return
    const m = makeCRT(terminal.texture, { phosphor: 'green' })
    mats.pc = m
    envReceivers.push(m)
    screen.material = m
  }, [screen])

  useFrame((_, dt) => {
    const s = useStore.getState()
    const active = s.phase === 'entered' && s.view === 'about'
    if (active && !shown.current) shown.current = true
    terminal.update(dt, shown.current, s.reducedMotion)
    if (screen && corners) publishQuad('terminal', screen, corners, camera, size.width, size.height, 1024, 770)
  })
  return null
}
