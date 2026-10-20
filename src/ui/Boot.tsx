import { useEffect, useMemo, useRef, useState } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { startAudio } from '../audio/audio'
import { emit } from '../lib/events'
import { consumePendingRoute, formatRoute } from '../state/router'
import { useStore } from '../state/store'
import { resolveShot } from '../scene/shots'
import { screens } from '../scene/screens'
import { useAnchor } from './useAnchor'

/** Enter the room (from a click, so audio may start). */
export function enter(withSound: boolean) {
  const s = useStore.getState()
  if (s.phase !== 'ready') return
  if (withSound) startAudio()
  emit('ui:click')
  const route = consumePendingRoute()
  s.set({ sound: withSound, phase: 'entered', view: route.view, project: route.project })
  if (location.hash !== formatRoute(route)) history.replaceState(null, '', formatRoute(route))
}

// TV screen in world space (three.js coords) — see blender/build_scene.py
const SCREEN_C = new Vector3(0.022, 1.073, 0.4805)
const SCREEN_HALF = new Vector3(0.151, 0.115, 0)

function tvRect(w: number, h: number) {
  const aspect = w / Math.max(1, h)
  const shot = resolveShot('loading', aspect)
  const cam = new PerspectiveCamera(shot.fov, aspect, 0.01, 100)
  cam.position.copy(shot.pos)
  cam.lookAt(shot.target)
  cam.updateMatrixWorld()
  const pts = [
    new Vector3(-1, 1, 0),
    new Vector3(1, -1, 0),
  ].map((s) => {
    const p = SCREEN_C.clone().add(new Vector3(SCREEN_HALF.x * s.x, SCREEN_HALF.y * s.y, 0)).project(cam)
    return [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h]
  })
  return { x: pts[0]![0]!, y: pts[0]![1]!, w: pts[1]![0]! - pts[0]![0]!, h: pts[1]![1]! - pts[0]![1]! }
}

/**
 * Loading: an HTML "CRT" drawn exactly where the 3D television will appear, so
 * the progress reads as being on the TV; when the room is ready it fades away
 * and the real CRT offers entry with or without sound.
 */
export function Boot() {
  const phase = useStore((s) => s.phase)
  const progress = useStore((s) => s.progress)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [gone, setGone] = useState(false)
  const entryRef = useRef<HTMLDivElement>(null)
  useAnchor('tv', entryRef, phase === 'ready')

  useEffect(() => {
    document.getElementById('boot')?.remove()
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    if (phase !== 'loading') {
      const t = setTimeout(() => setGone(true), 900)
      return () => clearTimeout(t)
    }
  }, [phase])

  const rect = useMemo(() => tvRect(vp.w, vp.h), [vp])
  const blocks = 24
  const on = Math.round(progress * blocks)

  return (
    <>
      {!gone && (
        <div className={`boot ${phase !== 'loading' ? 'boot--out' : ''}`} aria-hidden={phase !== 'loading'}>
          <div
            className="boot-tv"
            role="progressbar"
            aria-label="Loading the room"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, fontSize: rect.h / 14 }}
          >
            <div className="boot-osd">
              <span>▶▶ LOADING</span>
              <span>CH 00</span>
            </div>
            <div className="boot-bar">
              {Array.from({ length: blocks }, (_, i) => (
                <i key={i} className={i < on ? 'on' : ''} />
              ))}
              <b>{Math.round(progress * 100)}%</b>
            </div>
            <div className="boot-note">TUNING IN · PLEASE WAIT</div>
          </div>
        </div>
      )}
      {phase === 'ready' && (
        <div className="anchored entry" ref={entryRef} style={{ width: 1024, height: 780 }}>
          <h1 className="sr-only">Nithishhariharan M — an interactive desk at night</h1>
          <button
            className="hit"
            style={{ left: 172, top: 344, width: 680, height: 76 }}
            onPointerEnter={() => (screens.tv.entryChoice = 0)}
            onFocus={() => (screens.tv.entryChoice = 0)}
            onClick={() => enter(true)}
          >
            Enter with sound
          </button>
          <button
            className="hit"
            style={{ left: 172, top: 440, width: 680, height: 76 }}
            onPointerEnter={() => (screens.tv.entryChoice = 1)}
            onFocus={() => (screens.tv.entryChoice = 1)}
            onClick={() => enter(false)}
          >
            Enter without sound
          </button>
        </div>
      )}
    </>
  )
}
