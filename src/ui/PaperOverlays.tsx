import { useRef } from 'react'
import { site } from '../content/site'
import { useStore } from '../state/store'
import { contactCard, resumePage } from '../scene/Papers'
import { CARD_H, CARD_W } from '../scene/screens/contact'
import { RES_H, RES_W } from '../scene/screens/resume'
import { useAnchor } from './useAnchor'

/** Links laid over the lifted résumé printout + always-visible download buttons. */
export function ResumeOverlay() {
  const view = useStore((s) => s.view)
  const ref = useRef<HTMLDivElement>(null)
  const active = view === 'resume'
  useAnchor('resume', ref, active)
  if (!active) return null
  return (
    <>
      <div className="anchored page" ref={ref} style={{ width: RES_W, height: RES_H }} role="region" aria-label="Résumé printout">
        <h2 className="sr-only">Résumé</h2>
        {resumePage.hits.map((h) => (
          <a
            key={h.id}
            className="hit"
            href={site.resume.pdf}
            {...(h.id === 'download' ? { download: site.resume.fileName } : { target: '_blank', rel: 'noopener noreferrer' })}
            style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
            onPointerEnter={() => resumePage.render(h.id)}
            onPointerLeave={() => resumePage.render(null)}
            onFocus={() => resumePage.render(h.id)}
            onBlur={() => resumePage.render(null)}
          >
            {h.label}
          </a>
        ))}
      </div>
      <div className="paper-actions" role="group" aria-label="Résumé file">
        <a className="pill pill-solid" href={site.resume.pdf} download={site.resume.fileName}>
          Download PDF ↓
        </a>
        <a className="pill" href={site.resume.pdf} target="_blank" rel="noopener noreferrer">
          Open PDF ↗
        </a>
      </div>
    </>
  )
}

/** Links laid over the lifted contact card. */
export function ContactOverlay() {
  const view = useStore((s) => s.view)
  const ref = useRef<HTMLDivElement>(null)
  const active = view === 'contact'
  useAnchor('contact', ref, active)
  if (!active) return null
  return (
    <div className="anchored page" ref={ref} style={{ width: CARD_W, height: CARD_H }} role="region" aria-label="Contact card">
      <h2 className="sr-only">Contact</h2>
      {contactCard.hits.map((h) => (
        <a
          key={h.id}
          className="hit"
          href={h.href}
          {...(h.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          {...(h.id === 'resume' ? { download: site.resume.fileName } : {})}
          style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
          onPointerEnter={() => contactCard.render(h.id)}
          onPointerLeave={() => contactCard.render(null)}
          onFocus={() => contactCard.render(h.id)}
          onBlur={() => contactCard.render(null)}
        >
          {h.label}
          {h.href.startsWith('mailto:') ? `: ${site.contact.email}` : ''}
        </a>
      ))}
    </div>
  )
}
