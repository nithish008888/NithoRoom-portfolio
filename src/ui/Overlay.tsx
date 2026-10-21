import { useEffect, useRef, useState } from 'react'
import { setSound, startAudio, audioContext } from '../audio/audio'
import { projectById, site } from '../content/site'
import { emit, on } from '../lib/events'
import { toggleTube } from '../scene/lighting'
import { backToDesk, go } from '../state/router'
import { useStore, type View } from '../state/store'
import { Boot, enter } from './Boot'
import { NotepadOverlay } from './NotepadOverlay'
import { TerminalOverlay } from './TerminalOverlay'
import { ContactOverlay, ResumeOverlay } from './PaperOverlays'
import { MusicPanel } from './MusicPanel'
import { HotspotButtons } from './HotspotButtons'
import { LostNotice } from './LostNotice'

const NAV: { view: View; label: string; key: string }[] = [
  { view: 'about', label: 'About', key: 'A' },
  { view: 'work', label: 'Work', key: 'W' },
  { view: 'resume', label: 'Résumé', key: 'R' },
  { view: 'contact', label: 'Contact', key: 'C' },
]

const VIEW_NAMES: Record<View, string> = {
  overview: 'Back at the desk.',
  work: 'Work notepad open. Choose a project to play its tape.',
  about: 'The old computer: about me.',
  resume: 'Résumé printout.',
  contact: 'Contact card.',
  music: 'CD player.',
  tv: 'Watching the television.',
}

function hrefFor(view: View) {
  return view === 'overview' ? '#/' : `#/${view}`
}

function Header() {
  const view = useStore((s) => s.view)
  const phase = useStore((s) => s.phase)
  const pre = phase !== 'entered'
  return (
    <header className="top">
      <a className="logo" href="#/" onClick={() => pre && enter(false)}>
        {site.name.toUpperCase()}
      </a>
      <nav aria-label="Sections">
        {NAV.map((n) => (
          <a
            key={n.view}
            href={hrefFor(n.view)}
            aria-current={!pre && view === n.view ? 'page' : undefined}
            onClick={() => {
              emit('ui:click')
              if (pre) enter(false)
            }}
          >
            {n.label}
          </a>
        ))}
      </nav>
    </header>
  )
}

function Bottom() {
  const view = useStore((s) => s.view)
  const phase = useStore((s) => s.phase)
  const sound = useStore((s) => s.sound)
  const toggleSound = () => {
    const next = !sound
    if (next && !audioContext()) startAudio()
    else setSound(next)
    useStore.getState().set({ sound: next })
  }
  const backLabel = view === 'work' ? 'Put down notepad' : 'Back to the desk'
  return (
    <div className="bottom">
      {phase === 'entered' && view === 'overview' && (
        <p className="hints" aria-hidden="true">
          W work · A about · R résumé · C contact · M music · T tv · L light
        </p>
      )}
      <div className="pills">
        {phase === 'entered' && view !== 'overview' && (
          <button className="pill" onClick={() => backToDesk()}>
            {backLabel} · Esc
          </button>
        )}
        <a className="pill" href="?reading">
          Reading version
        </a>
        <button className={`pill ${sound ? 'on' : ''}`} aria-pressed={sound} onClick={toggleSound}>
          Sound {sound ? 'on' : 'off'}
        </button>
      </div>
    </div>
  )
}

function Tooltip() {
  const hover = useStore((s) => s.hover)
  const view = useStore((s) => s.view)
  const phase = useStore((s) => s.phase)
  const moving = useStore((s) => s.moving)
  const ref = useRef<HTMLDivElement>(null)
  const [mouse, setMouse] = useState(false)
  const [overUi, setOverUi] = useState(false)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      setMouse(e.pointerType === 'mouse')
      const el = ref.current
      if (el) el.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 20}px)`
      const t = e.target as HTMLElement
      setOverUi(!!t.closest?.('.top, .bottom, .page'))
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  let label = hover?.label ?? null
  if (!label && phase === 'entered' && view === 'work' && !overUi) label = 'PUT DOWN NOTEPAD'
  const show = mouse && !!label && phase === 'entered' && !moving
  return (
    <div className={`tooltip ${show ? 'show' : ''}`} ref={ref} aria-hidden="true">
      {label}
    </div>
  )
}

function Keys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (s.phase === 'ready') {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return
        return
      }
      if (s.phase !== 'entered') return
      if (e.key === 'Escape') {
        if (s.view !== 'overview') {
          e.preventDefault()
          backToDesk()
        }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'l') {
        toggleTube() // the room light, from anywhere
        return
      }
      if (s.view === 'about') return // the terminal handles its own keys
      const map: Record<string, View> = { w: 'work', a: 'about', r: 'resume', c: 'contact', m: 'music', t: 'tv' }
      if (map[k] && s.view !== map[k]) {
        emit('ui:click')
        go(map[k]!, map[k] === 'work' ? s.project : null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}

function Live() {
  const view = useStore((s) => s.view)
  const phase = useStore((s) => s.phase)
  const vcr = useStore((s) => s.vcr)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (phase === 'ready') setMsg('The room is ready. Choose to enter with or without sound.')
  }, [phase])
  useEffect(() => {
    if (phase === 'entered') setMsg(VIEW_NAMES[view])
  }, [view, phase])
  useEffect(() => {
    const p = projectById(vcr.tape)
    if (vcr.status === 'loading' && p) setMsg(`Loading tape: ${p.title}.`)
    if (vcr.status === 'playing' && p) setMsg(`Now playing on the television: ${p.title}.`)
  }, [vcr.status, vcr.tape])
  useEffect(
    () =>
      useStore.subscribe(
        (s) => s.lights,
        (l, prev) => {
          if (l.tube !== prev.tube) setMsg(`Room light ${l.tube ? 'on' : 'off'}.`)
          else if (l.lamp !== prev.lamp) setMsg(`Desk lamp ${l.lamp ? 'on' : 'off'}.`)
        },
      ),
    [],
  )
  return (
    <div className="sr-only" aria-live="polite" role="status">
      {msg}
    </div>
  )
}

function CutFade() {
  const [k, setK] = useState(0)
  useEffect(() => {
    const fn = () => setK((v) => v + 1)
    document.body.addEventListener('cutfade', fn)
    const off = on('cutfade', fn)
    return () => {
      document.body.removeEventListener('cutfade', fn)
      off()
    }
  }, [])
  return k ? <div key={k} className="cutfade" aria-hidden="true" /> : null
}

export function Overlay() {
  return (
    <div className="hud">
      <a className="skip" href="?reading">
        Skip to the reading version
      </a>
      <Header />
      <Boot />
      <HotspotButtons />
      <NotepadOverlay />
      <TerminalOverlay />
      <ResumeOverlay />
      <ContactOverlay />
      <MusicPanel />
      <Bottom />
      <Tooltip />
      <Keys />
      <Live />
      <CutFade />
      <LostNotice />
    </div>
  )
}
