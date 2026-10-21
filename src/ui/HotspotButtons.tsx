import { useEffect, useRef } from 'react'
import { emit } from '../lib/events'
import { anchors } from '../scene/anchors'
import { toggleLamp, toggleTube } from '../scene/lighting'
import { FOCUS_SPOTS } from '../scene/SpotAnchors'
import { go } from '../state/router'
import { useStore, type View } from '../state/store'

/**
 * Keyboard access to the objects in the room. The buttons are invisible to the
 * mouse (pointer events go to the 3D scene) but Tab moves through them and the
 * focused one draws a ring around its object with a short label.
 */
export function HotspotButtons() {
  const view = useStore((s) => s.view)
  const phase = useStore((s) => s.phase)
  const focus = useStore((s) => s.focus)
  const lights = useStore((s) => s.lights)
  const ring = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focus?.startsWith('spot:')) return
    let raf = 0
    const tick = () => {
      const q = anchors.get(focus)
      const el = ring.current
      if (q && el) {
        const [[x0, y0], , [x1, y1]] = q.pts as [[number, number], [number, number], [number, number]]
        el.style.transform = `translate(${x0}px, ${y0}px)`
        el.style.width = `${Math.max(24, x1 - x0)}px`
        el.style.height = `${Math.max(24, y1 - y0)}px`
        el.style.opacity = '1'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [focus])

  const spots = FOCUS_SPOTS.filter((f) => ('in' in f ? f.in : 'overview') === view)
  if (phase !== 'entered' || !spots.length) return null
  const labelOf = (f: (typeof FOCUS_SPOTS)[number]) => {
    if (!('toggle' in f)) return f.label
    const on = lights[f.toggle]
    return `${f.label}: ${on ? 'on' : 'off'} — switch ${on ? 'off' : 'on'}`
  }
  const active = spots.find((f) => `spot:${f.id}` === focus)
  return (
    <>
      <ul className="spots" aria-label={view === 'overview' ? 'Objects on the desk' : 'Objects in this corner'}>
        {spots.map((f) => (
          <li key={f.id}>
            <button
              className="spot-btn"
              aria-pressed={'toggle' in f ? lights[f.toggle] : undefined}
              onFocus={() => useStore.getState().set({ focus: `spot:${f.id}` })}
              onBlur={() => useStore.getState().set({ focus: null })}
              onClick={() => {
                if ('toggle' in f) {
                  if (f.toggle === 'lamp') toggleLamp()
                  else toggleTube()
                  return
                }
                emit('ui:click')
                go(f.view as View, 'project' in f ? f.project : null)
              }}
            >
              {'toggle' in f ? f.label : labelOf(f)}
            </button>
          </li>
        ))}
      </ul>
      {active && (
        <div className="spot-ring" ref={ring} aria-hidden="true">
          <span>{labelOf(active)}</span>
        </div>
      )}
    </>
  )
}
