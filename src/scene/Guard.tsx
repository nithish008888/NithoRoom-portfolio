import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'

/**
 * Keeps the room usable on weak hardware: if frames stay slow after entering,
 * switch to the light renderer (lower resolution, fewer effects). Also handles
 * a lost WebGL context by offering the reading version.
 */
export function Guard() {
  const gl = useThree((s) => s.gl)
  const acc = useRef({ t: 0, n: 0, slow: 0 })

  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => {
      e.preventDefault()
      document.body.dispatchEvent(new CustomEvent('room-lost'))
    }
    el.addEventListener('webglcontextlost', lost)
    return () => el.removeEventListener('webglcontextlost', lost)
  }, [gl])

  useFrame((_, dt) => {
    const s = useStore.getState()
    // a single long gap (tab back from the background, a one-off shader compile) is not a slow GPU
    if (s.phase !== 'entered' || s.lowPower || document.hidden || dt > 0.5) return
    const a = acc.current
    a.t += dt
    a.n++
    if (a.t >= 2) {
      const avg = a.t / a.n
      a.slow = avg > 1 / 22 ? a.slow + 1 : 0
      a.t = 0
      a.n = 0
      if (a.slow >= 2) {
        console.info('[room] slow frames — switching to the light renderer')
        s.set({ lowPower: true })
      }
    }
  })
  return null
}
