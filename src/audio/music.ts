/**
 * CD player engine. Tracks with a file (src in site.ts) stream through the desk speakers; a track
 * without one falls back to a short lo-fi loop rendered offline in the browser (FM electric piano,
 * bass, pad, soft drums, vinyl hiss).
 */
import { site, type Track } from '../content/site'
import { emit } from '../lib/events'
import { useStore } from '../state/store'
import { audioContext, audioOut, setSound, startAudio } from './audio'
import { speakerInput } from './speakers'

const PROGRESSIONS: Record<string, number[][]> = {
  // semitones relative to the key root for each chord (voiced around C3–C5)
  rain: [
    [2, 5, 9, 12, 16], // ii9
    [7, 11, 14, 17, 21], // V13-ish
    [0, 4, 7, 11, 14], // Imaj9
    [9, 12, 16, 19, 23], // vi9
  ],
  dusk: [
    [0, 4, 7, 11, 14],
    [4, 7, 11, 14, 17],
    [9, 12, 16, 19, 23],
    [5, 9, 12, 16, 19],
  ],
  late: [
    [9, 12, 16, 19, 23],
    [5, 9, 12, 16, 19],
    [0, 4, 7, 11, 14],
    [7, 10, 14, 17, 21],
  ],
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const b = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return b
}

function noise(ctx: BaseAudioContext, seconds: number) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

async function renderGenerated(g: NonNullable<Track['generated']>): Promise<AudioBuffer> {
  const sr = 32000
  const bars = 16
  const beat = 60 / g.bpm
  const dur = bars * 4 * beat + 2.5
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr)
  const bus = ctx.createGain()
  bus.gain.value = 0.8
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 5200
  const shaper = ctx.createWaveShaper()
  const curve = new Float32Array(1024)
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6)
  }
  shaper.curve = curve
  const verb = ctx.createConvolver()
  verb.buffer = impulse(ctx, 2.4, 2.6)
  const wet = ctx.createGain()
  wet.gain.value = 0.22
  bus.connect(lp).connect(shaper).connect(ctx.destination)
  bus.connect(verb).connect(wet).connect(ctx.destination)
  const nbuf = noise(ctx, 1)
  const prog = PROGRESSIONS[g.mood] ?? PROGRESSIONS.rain!
  const root = 48 + g.key // C3 + key

  const epiano = (t: number, midi: number, len: number, vel: number) => {
    const f = mtof(midi)
    const car = ctx.createOscillator()
    car.frequency.value = f
    const mod = ctx.createOscillator()
    mod.frequency.value = f
    const mg = ctx.createGain()
    mg.gain.setValueAtTime(f * 1.4, t)
    mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.9)
    mod.connect(mg).connect(car.frequency)
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(vel, t + 0.006)
    amp.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.6)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len)
    const pan = ctx.createStereoPanner()
    pan.pan.value = ((midi % 7) - 3) * 0.08
    car.connect(amp).connect(pan).connect(bus)
    car.start(t)
    mod.start(t)
    car.stop(t + len + 0.05)
    mod.stop(t + len + 0.05)
  }
  const bass = (t: number, midi: number, len: number) => {
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = mtof(midi)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 420
    const a = ctx.createGain()
    a.gain.setValueAtTime(0, t)
    a.gain.linearRampToValueAtTime(0.32, t + 0.02)
    a.gain.exponentialRampToValueAtTime(0.0001, t + len)
    o.connect(f).connect(a).connect(bus)
    o.start(t)
    o.stop(t + len + 0.05)
  }
  const pad = (t: number, notes: number[], len: number) => {
    for (const n of notes.slice(0, 3)) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = mtof(root + 12 + n)
        o.detune.value = det
        const f = ctx.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.value = 700
        const a = ctx.createGain()
        a.gain.setValueAtTime(0, t)
        a.gain.linearRampToValueAtTime(0.012, t + len * 0.4)
        a.gain.linearRampToValueAtTime(0, t + len)
        o.connect(f).connect(a).connect(bus)
        o.start(t)
        o.stop(t + len + 0.05)
      }
    }
  }
  const kick = (t: number) => {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(110, t)
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12)
    const a = ctx.createGain()
    a.gain.setValueAtTime(0.5, t)
    a.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
    o.connect(a).connect(bus)
    o.start(t)
    o.stop(t + 0.4)
  }
  const hit = (t: number, freq: number, q: number, gain: number, len: number, type: BiquadFilterType = 'bandpass') => {
    const s = ctx.createBufferSource()
    s.buffer = nbuf
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const a = ctx.createGain()
    a.gain.setValueAtTime(gain, t)
    a.gain.exponentialRampToValueAtTime(0.0001, t + len)
    s.connect(f).connect(a).connect(bus)
    s.start(t, Math.random() * 0.5, len + 0.02)
  }
  let seed = g.key * 31 + g.bpm
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let bar = 0; bar < bars; bar++) {
    const chord = prog[Math.floor(bar / 2) % prog.length]!
    const t0 = 0.4 + bar * 4 * beat
    const fresh = bar % 2 === 0
    if (fresh) {
      chord.forEach((n, i) => epiano(t0 + i * 0.018 + rnd() * 0.01, root + 12 + n, beat * 7.6, 0.07 - i * 0.006))
      pad(t0, chord, beat * 8)
    } else {
      ;[1, 3].forEach((i) => epiano(t0 + beat * 1.5 + rnd() * 0.02, root + 24 + chord[i]!, beat * 2, 0.04))
    }
    const r = root - 12 + chord[0]!
    bass(t0, r, beat * 1.6)
    bass(t0 + beat * 2.5, r, beat * 1.2)
    if (bar >= 1) {
      for (let b = 0; b < 4; b++) {
        const tb = t0 + b * beat
        if (b === 0 || (b === 2 && rnd() > 0.35)) kick(tb)
        if (b === 1 || b === 3) hit(tb, 1900, 0.8, 0.12, 0.16)
        for (let e = 0; e < 2; e++) hit(tb + e * beat * (e ? 0.58 : 0), 7600, 1.2, e ? 0.025 : 0.04, 0.05, 'highpass')
      }
    }
  }
  // vinyl: soft hiss + sparse crackle
  const hissSrc = ctx.createBufferSource()
  hissSrc.buffer = nbuf
  hissSrc.loop = true
  const hf = ctx.createBiquadFilter()
  hf.type = 'bandpass'
  hf.frequency.value = 5000
  hf.Q.value = 0.4
  const hg = ctx.createGain()
  hg.gain.value = 0.006
  hissSrc.connect(hf).connect(hg).connect(ctx.destination)
  hissSrc.start(0)
  for (let i = 0; i < dur * 3; i++) hit(rnd() * dur, 3000 + rnd() * 4000, 3, 0.02 + rnd() * 0.03, 0.006)
  return ctx.startRendering()
}

/**
 * Plays the disc through the desk speakers (see ./speakers). Tracks with a file stream from an <audio>
 * element (no full decode in memory); tracks without one fall back to a generated loop.
 */
export class MusicPlayer {
  private el: HTMLAudioElement | null = null
  private buffers = new Map<number, AudioBuffer>()
  private source: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null
  private startedAt = 0
  private offset = 0
  track = 0
  playing = false
  volume = 0.7
  onEnded?: () => void

  get tracks() {
    return site.music.tracks
  }

  private output(ctx: AudioContext) {
    if (!this.gain) {
      this.gain = ctx.createGain()
      this.gain.gain.value = this.volume
      this.gain.connect(speakerInput() ?? audioOut()!)
    }
    return this.gain
  }

  private element(ctx: AudioContext) {
    if (!this.el) {
      const el = new Audio()
      el.crossOrigin = 'anonymous'
      el.preload = 'auto'
      el.addEventListener('ended', () => {
        this.playing = false
        this.onEnded?.()
      })
      ctx.createMediaElementSource(el).connect(this.output(ctx))
      this.el = el
    }
    return this.el
  }

  private isFile(i = this.track) {
    return !!this.tracks[i]?.src
  }

  async load(i: number): Promise<AudioBuffer> {
    const cached = this.buffers.get(i)
    if (cached) return cached
    const t = this.tracks[i]!
    const buf = await renderGenerated(t.generated ?? { key: 2, bpm: 74, mood: 'rain' })
    this.buffers.set(i, buf)
    return buf
  }

  duration(i = this.track) {
    if (this.isFile(i)) return i === this.track && this.el && Number.isFinite(this.el.duration) ? this.el.duration : 0
    return this.buffers.get(i)?.duration ?? 0
  }

  elapsed() {
    if (this.isFile()) return this.el?.currentTime ?? 0
    const ctx = audioContext()
    if (!ctx) return this.offset
    return this.playing ? Math.min(this.duration(), this.offset + ctx.currentTime - this.startedAt) : this.offset
  }

  async play(i = this.track, from?: number) {
    if (!audioContext()) startAudio()
    const ctx = audioContext()!
    void ctx.resume()
    const changed = i !== this.track
    this.stopSource()
    this.track = i
    const t = this.tracks[i]!
    if (t.src) {
      const el = this.element(ctx)
      if (changed || !el.src.endsWith(t.src)) el.src = t.src
      if (from !== undefined) el.currentTime = from
      else if (el.ended) el.currentTime = 0
      await el.play()
      this.playing = this.track === i
      return
    }
    this.el?.pause()
    if (changed) this.offset = 0
    if (from !== undefined) this.offset = from
    const buf = await this.load(i)
    if (this.track !== i) return // another track was chosen while rendering
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.output(ctx))
    src.onended = () => {
      if (this.source !== src) return
      this.playing = false
      this.offset = 0
      this.onEnded?.()
    }
    if (this.offset >= buf.duration) this.offset = 0
    src.start(0, this.offset)
    this.source = src
    this.startedAt = ctx.currentTime
    this.playing = true
  }

  pause() {
    if (!this.playing) return
    if (this.isFile()) this.el?.pause()
    else {
      this.offset = this.elapsed()
      this.stopSource()
    }
    this.playing = false
  }

  stop() {
    this.stopSource()
    if (this.el) {
      this.el.pause()
      this.el.currentTime = 0
    }
    this.playing = false
    this.offset = 0
  }

  setVolume(v: number) {
    this.volume = v
    if (this.gain && audioContext()) this.gain.gain.setTargetAtTime(v, audioContext()!.currentTime, 0.05)
  }

  private stopSource() {
    if (this.source) {
      const s = this.source
      this.source = null
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
  }
}

export const music = new MusicPlayer()

/**
 * Start (or resume) the music: an explicit request for audio, so sound is switched on if the visitor
 * entered without it. Used by the Discman, the speakers and the CD panel.
 */
export async function startMusic(i = music.track, from?: number) {
  const st = useStore.getState()
  emit('cd:button')
  st.setMusic({ track: i, loading: true })
  if (!audioContext()) startAudio()
  else setSound(true)
  if (!st.sound) st.set({ sound: true })
  try {
    await music.play(i, from)
  } finally {
    st.setMusic({ playing: music.playing, loading: false, duration: music.duration(i), track: music.track })
  }
}

export function pauseMusic() {
  emit('cd:button')
  music.pause()
  useStore.getState().setMusic({ playing: false })
}
