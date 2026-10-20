import { useEffect, useRef, useState } from 'react'
import { projects } from '../content/site'
import { emit } from '../lib/events'
import { go } from '../state/router'
import { useStore } from '../state/store'
import { screens } from '../scene/screens'
import { PAGE_H, PAGE_W, type HitBox } from '../scene/screens/notepad'
import { useAnchor } from './useAnchor'

/**
 * Real buttons/links laid exactly over the handwriting on the lifted notepad.
 * They are visually transparent (the canvas is what you see) but focusable,
 * announced by screen readers, and they drive the in-world hover highlight.
 */
export function NotepadOverlay() {
  const view = useStore((s) => s.view)
  const project = useStore((s) => s.project)
  const ref = useRef<HTMLDivElement>(null)
  const [hits, setHits] = useState<HitBox[]>([])
  const active = view === 'work'
  useAnchor('notepad', ref, active)

  useEffect(() => {
    if (!active) return
    let raf = 0
    let last: HitBox[] | null = null
    const tick = () => {
      if (screens.notepad.hits !== last) {
        last = screens.notepad.hits
        setHits(last)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  if (!active) return null
  const set = useStore.getState().set
  const setHover = useStore.getState().setHover
  return (
    <div
      className="anchored page"
      ref={ref}
      style={{ width: PAGE_W, height: PAGE_H }}
      role="region"
      aria-label="Work notepad"
      onPointerLeave={() => setHover(null)}
    >
      <h2 className="sr-only">Work</h2>
      {hits.map((h) =>
        h.kind === 'project' ? (
          <button
            key={h.id}
            className="hit"
            style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
            aria-pressed={project === h.projectId}
            aria-label={h.label}
            onPointerEnter={() => setHover({ id: `page:${h.id}`, label: `PLAY · ${projects.find((p) => p.id === h.projectId)?.short.toUpperCase()}` })}
            onPointerLeave={() => setHover(null)}
            onFocus={() => set({ focus: `page:${h.id}` })}
            onBlur={() => set({ focus: null })}
            onClick={() => {
              emit('ui:click')
              go('work', h.projectId!)
            }}
          >
            {h.label}
          </button>
        ) : (
          <a
            key={h.id}
            className="hit"
            href={h.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
            onPointerEnter={() => setHover({ id: `page:${h.id}`, label: 'OPEN LINK ↗' })}
            onPointerLeave={() => setHover(null)}
            onFocus={() => set({ focus: `page:${h.id}` })}
            onBlur={() => set({ focus: null })}
          >
            {h.label} (opens in a new tab)
          </a>
        ),
      )}
    </div>
  )
}
