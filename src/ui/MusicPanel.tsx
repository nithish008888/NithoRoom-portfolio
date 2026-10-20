import { useEffect } from 'react'
import { music, pauseMusic, startMusic } from '../audio/music'
import { site } from '../content/site'
import { backToDesk } from '../state/router'
import { useStore } from '../state/store'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const play = (i: number) => startMusic(i)

/** Plain, readable controls for the CD player (the Discman's LCD mirrors them in the room). */
export function MusicPanel() {
  const view = useStore((s) => s.view)
  const m = useStore((s) => s.music)
  const active = view === 'music'

  useEffect(() => {
    music.onEnded = () => {
      const next = (music.track + 1) % music.tracks.length
      void play(next)
    }
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      if (t - last > 250) {
        last = t
        const st = useStore.getState()
        const e = music.elapsed()
        if (Math.abs(e - st.music.elapsed) > 0.2 || st.music.playing !== music.playing) st.setMusic({ elapsed: e, playing: music.playing })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!active) return null
  const tracks = site.music.tracks
  const toggle = () => {
    if (music.playing) pauseMusic()
    else void play(m.track)
  }
  const step = (d: number) => void play((m.track + d + tracks.length) % tracks.length)
  return (
    <section className="cd-panel" aria-label="CD player">
      <header className="cd-head">
        <b>DISC·MATE</b>
        <span>{site.music.disc}</span>
      </header>
      <ol className="cd-tracks">
        {tracks.map((t, i) => (
          <li key={t.title}>
            <button aria-current={i === m.track ? 'true' : undefined} onClick={() => void play(i)}>
              <span className="cd-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="cd-t">{t.title}</span>
              <span className="cd-a">{t.artist}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="cd-transport">
        <button className="cd-btn" aria-label="Previous track" onClick={() => step(-1)}>
          ⏮
        </button>
        <button className="cd-btn cd-play" aria-label={m.playing ? 'Pause' : 'Play'} onClick={toggle}>
          {m.loading ? '…' : m.playing ? '❚❚' : '▶'}
        </button>
        <button className="cd-btn" aria-label="Next track" onClick={() => step(1)}>
          ⏭
        </button>
        <span className="cd-time" aria-live="off">
          {fmt(m.elapsed)} / {m.duration ? fmt(m.duration) : '--:--'}
        </span>
      </div>
      <label className="cd-seek">
        <span className="sr-only">Position</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, m.duration)}
          step={0.5}
          value={Math.min(m.elapsed, m.duration || 0)}
          disabled={!m.duration}
          onChange={(e) => {
            const v = +e.target.value
            void music.play(m.track, v)   // seeking: no button sound
            useStore.getState().setMusic({ elapsed: v, playing: true })
          }}
        />
      </label>
      <label className="cd-vol">
        <span>VOL</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={m.volume}
          onChange={(e) => {
            const v = +e.target.value
            music.setVolume(v)
            useStore.getState().setMusic({ volume: v })
          }}
        />
      </label>
      <p className="cd-note">{site.music.note}</p>
      <button className="pill" onClick={() => backToDesk()}>
        Back to the desk · Esc
      </button>
    </section>
  )
}
