import { useEffect, type RefObject } from 'react'
import { anchors, quadToMatrix3d } from '../scene/anchors'

/** Keeps an element glued onto a 3D surface published by the scene (see scene/anchors.ts). */
export function useAnchor(name: string, ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let last = ''
    const tick = () => {
      const el = ref.current
      const q = anchors.get(name)
      if (el) {
        if (q && q.visible) {
          const m = quadToMatrix3d(q.w, q.h, q.pts)
          if (m !== last) {
            el.style.transform = m
            last = m
          }
          el.style.visibility = 'visible'
        } else el.style.visibility = 'hidden'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [name, ref, enabled])
}
