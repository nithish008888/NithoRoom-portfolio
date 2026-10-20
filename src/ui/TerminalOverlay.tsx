import { useEffect, useRef, useState } from 'react'
import { site } from '../content/site'
import { emit } from '../lib/events'
import { backToDesk } from '../state/router'
import { useStore } from '../state/store'
import { terminal } from '../scene/Terminal'
import { useAnchor } from './useAnchor'

/**
 * Keyboard + screen-reader layer for the About terminal: arrows/space scroll the
 * pager, Tab walks the links (highlighted in-world), Q or Esc quits.
 */
export function TerminalOverlay() {
  const view = useStore((s) => s.view)
  const active = view === 'about'
  const ref = useRef<HTMLDivElement>(null)
  const [boxes, setBoxes] = useState(terminal.linkBoxes())
  useAnchor('terminal', ref, active)

  useEffect(() => {
    if (!active) return
    const sync = () => setBoxes(terminal.linkBoxes())
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      let used = true
      if (k === 'ArrowDown' || k === 'j') terminal.scrollBy(1)
      else if (k === 'ArrowUp' || k === 'k') terminal.scrollBy(-1)
      else if (k === ' ' || k === 'PageDown') terminal.scrollBy(e.shiftKey ? -terminal.rows + 1 : terminal.rows - 1)
      else if (k === 'PageUp' || k === 'b') terminal.scrollBy(-terminal.rows + 1)
      else if (k === 'Home' || k === 'g') terminal.scrollTo(0)
      else if (k === 'End' || k === 'G') terminal.scrollTo(terminal.maxScroll)
      else if (k === 'q' || k === 'Q') backToDesk()
      else used = false
      if (used) {
        e.preventDefault()
        emit('key')
        sync()
      }
    }
    const onWheel = (e: WheelEvent) => {
      terminal.scrollBy(Math.sign(e.deltaY) * 2)
      sync()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [active])

  if (!active) return null
  return (
    <div className="anchored page" ref={ref} style={{ width: 1024, height: 770 }} role="region" aria-label="About me — old computer">
      <article className="sr-only">
        <h2>{site.about.heading}</h2>
        {site.about.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <h3>Interests</h3>
        <ul>
          {site.about.interests.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <h3>Skills</h3>
        <ul>
          {site.about.skills.map((s) => (
            <li key={s.label}>
              {s.label}: {s.items.join(', ')}
            </li>
          ))}
        </ul>
        <h3>Education</h3>
        <ul>
          {site.about.education.map((e) => (
            <li key={e.school}>
              {e.school}, {e.degree} {e.period} {e.note}
            </li>
          ))}
        </ul>
      </article>
      {boxes.map((b) => (
        <a
          key={b.index}
          className="hit"
          href={b.href}
          target={b.href.startsWith('mailto') ? undefined : '_blank'}
          rel="noopener noreferrer"
          style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
          onFocus={() => (terminal.focusLink = b.index)}
          onBlur={() => (terminal.focusLink = -1)}
          onPointerEnter={() => (terminal.focusLink = b.index)}
          onPointerLeave={() => (terminal.focusLink = -1)}
        >
          {b.label}
        </a>
      ))}
    </div>
  )
}
