/**
 * Sound for the room, synthesised with WebAudio (no audio files needed):
 * muffled rain on the window, tape/VCR mechanics, static, paper, clicks.
 * Nothing plays until the visitor chooses "enter with sound".
 */
import { on } from '../lib/events'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let sfx: GainNode | null = null
let ambience: GainNode | null = null
let enabled = false
let noiseBuf: AudioBuffer | null = null
let pinkBuf: AudioBuffer | null = null
let dripTimer = 0

export function audioContext() {
  return ctx
}
export function audioOut() {
  return master
}

function makeNoise(c: AudioContext, seconds: number, pink = false) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const d = b.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    if (!pink) {
      d[i] = w
      continue
    }
    // Paul Kellet's pink noise filter
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  return b
}

/** Must be called from a user gesture (the "enter with sound" click). */
export function startAudio() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    master.connect(comp).connect(ctx.destination)
    sfx = ctx.createGain()
    sfx.gain.value = 0.7
    sfx.connect(master)
    ambience = ctx.createGain()
    ambience.gain.value = 0
    ambience.connect(master)
    noiseBuf = makeNoise(ctx, 2)
    pinkBuf = makeNoise(ctx, 6, true)
    startRain()
  }
  void ctx.resume()
  setSound(true)
}

export function setSound(on_: boolean) {
  enabled = on_
  if (!ctx || !master || !ambience) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setTargetAtTime(on_ ? 0.9 : 0, t, 0.25)
  ambience.gain.setTargetAtTime(on_ ? 1 : 0, t, 0.8)
  if (on_) void ctx.resume()
}

export const soundEnabled = () => enabled && !!ctx

function startRain() {
  if (!ctx || !ambience || !pinkBuf) return
  // steady rain: pink noise through the glass (low-passed) + a brighter splash layer
  const src = ctx.createBufferSource()
  src.buffer = pinkBuf
  src.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1500
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 140
  const g = ctx.createGain()
  g.gain.value = 0.32
  src.connect(hp).connect(lp).connect(g).connect(ambience)
  src.start()
  const src2 = ctx.createBufferSource()
  src2.buffer = pinkBuf
  src2.loop = true
  src2.playbackRate.value = 1.37
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 3800
  bp.Q.value = 0.6
  const g2 = ctx.createGain()
  g2.gain.value = 0.05
  src2.connect(bp).connect(g2).connect(ambience)
  src2.start(0, 2.1)
  // room tone
  const src3 = ctx.createBufferSource()
  src3.buffer = pinkBuf
  src3.loop = true
  src3.playbackRate.value = 0.4
  const lp3 = ctx.createBiquadFilter()
  lp3.type = 'lowpass'
  lp3.frequency.value = 180
  const g3 = ctx.createGain()
  g3.gain.value = 0.12
  src3.connect(lp3).connect(g3).connect(ambience)
  src3.start(0, 1.3)
  const drip = () => {
    if (!ctx || !ambience) return
    if (enabled) tick(ambience, 2600 + Math.random() * 2600, 0.02 + Math.random() * 0.035, 0.012)
    dripTimer = window.setTimeout(drip, 120 + Math.random() * 520)
  }
  drip()
}

export function stopAudioTimers() {
  window.clearTimeout(dripTimer)
}

// ------------------------------------------------------------------ building blocks
function tick(dest: AudioNode, freq: number, gain: number, dur: number, at = 0) {
  if (!ctx || !noiseBuf) return
  const t = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = 2.2
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(dest)
  s.start(t, Math.random() * 1.5, dur + 0.02)
}

function thump(freq: number, gain: number, dur: number, at = 0) {
  if (!ctx || !sfx) return
  const t = ctx.currentTime + at
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq * 1.8, t)
  o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.4)
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(sfx)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function whir(gain: number, dur: number, at = 0, from = 420, to = 760) {
  if (!ctx || !sfx || !noiseBuf) return
  const t = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 6
  f.frequency.setValueAtTime(from, t)
  f.frequency.linearRampToValueAtTime(to, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.06)
  g.gain.setValueAtTime(gain, t + dur - 0.1)
  g.gain.linearRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(sfx)
  s.start(t)
  s.stop(t + dur + 0.05)
}

function hiss(gain: number, dur: number, freq = 3200) {
  if (!ctx || !sfx || !noiseBuf) return
  const t = ctx.currentTime
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = freq
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.03)
  g.gain.setValueAtTime(gain, t + dur - 0.15)
  g.gain.linearRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(sfx)
  s.start(t)
  s.stop(t + dur + 0.05)
}

function rustle(gain: number, dur: number) {
  if (!ctx || !sfx || !noiseBuf) return
  for (let i = 0; i < 5; i++) tick(sfx, 1800 + Math.random() * 3000, gain * (0.5 + Math.random() * 0.5), 0.05 + Math.random() * 0.08, (i / 5) * dur)
}

/** A short metallic ring (the tube light's starter). */
function ping(freq: number, gain: number, dur: number) {
  if (!ctx || !sfx) return
  const t = ctx.currentTime
  for (const [mul, g] of [[1, 1], [2.76, 0.35]] as const) {
    const o = ctx.createOscillator()
    o.frequency.value = freq * mul
    const e = ctx.createGain()
    e.gain.setValueAtTime(gain * g, t)
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(e).connect(sfx)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
}

/** Thunder far over the city: low rolling noise on the ambience bus, after the flash. */
function rumble(gain: number, dur: number, at: number) {
  if (!ctx || !ambience || !pinkBuf) return
  const t = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = pinkBuf
  s.loop = true
  s.playbackRate.value = 0.32
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(520, t)
  lp.frequency.exponentialRampToValueAtTime(110, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.3)
  g.gain.exponentialRampToValueAtTime(gain * 0.4, t + dur * 0.3)
  g.gain.exponentialRampToValueAtTime(gain * 0.75, t + dur * 0.45)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(lp).connect(g).connect(ambience)
  s.start(t, Math.random() * 4)
  s.stop(t + dur + 0.1)
}

// the tube light's hum (50 Hz mains -> 100 Hz), very faint, while it is on
let hum: GainNode | null = null
function setHum(on_: boolean) {
  if (!ctx || !ambience) return
  if (!hum) {
    hum = ctx.createGain()
    hum.gain.value = 0
    for (const [f, g] of [[100, 1], [200, 0.45], [300, 0.15]] as const) {
      const o = ctx.createOscillator()
      o.frequency.value = f
      const e = ctx.createGain()
      e.gain.value = g
      o.connect(e).connect(hum)
      o.start()
    }
    hum.connect(ambience)
  }
  hum.gain.setTargetAtTime(on_ ? 0.0045 : 0, ctx.currentTime, on_ ? 0.4 : 0.05)
}

// ------------------------------------------------------------------ cues
on('ui:click', () => soundEnabled() && sfx && tick(sfx, 3000, 0.06, 0.03))
on('cd:button', () => soundEnabled() && sfx && (tick(sfx, 2400, 0.08, 0.025), thump(900, 0.02, 0.03)))
on('tape:lift', () => soundEnabled() && sfx && (tick(sfx, 1800, 0.09, 0.05), tick(sfx, 1200, 0.05, 0.06, 0.05)))
on('vcr:door', () => soundEnabled() && sfx && tick(sfx, 2200, 0.05, 0.03))
on('tape:insert', () => {
  if (!soundEnabled()) return
  thump(70, 0.35, 0.18)
  sfx && tick(sfx, 1400, 0.12, 0.05)
  whir(0.05, 0.75, 0.08)
  thump(95, 0.18, 0.12, 0.85)
})
on('tv:static', () => soundEnabled() && hiss(0.05, 0.95))
on('tape:eject', () => {
  if (!soundEnabled()) return
  whir(0.05, 0.5, 0, 700, 380)
  thump(80, 0.25, 0.14, 0.42)
  sfx && tick(sfx, 1600, 0.1, 0.05, 0.44)
})
on('tape:drop', () => soundEnabled() && (thump(160, 0.12, 0.08), sfx && tick(sfx, 2400, 0.08, 0.03)))
on('notepad:lift', () => soundEnabled() && rustle(0.07, 0.3))
on('notepad:down', () => soundEnabled() && (rustle(0.05, 0.22), thump(120, 0.05, 0.06, 0.25)))
on('key', () => soundEnabled() && sfx && (tick(sfx, 1500 + Math.random() * 600, 0.08, 0.025), thump(300, 0.03, 0.03)))
on('paper', () => soundEnabled() && rustle(0.05, 0.2))
on('switch', (d) => {
  setHum(!!d)
  if (soundEnabled() && sfx) (tick(sfx, 3600, 0.16, 0.018), thump(240, 0.06, 0.03))
})
on('lamp:click', () => soundEnabled() && sfx && (tick(sfx, 2900, 0.12, 0.02), tick(sfx, 1700, 0.05, 0.03, 0.035)))
on('tube:tink', () => soundEnabled() && ping(2650 + Math.random() * 300, 0.018, 0.09))
on('thunder', (d) => {
  const { delay, strength } = d as { delay: number; strength: number }
  if (soundEnabled()) rumble(0.5 * strength, 3.2 + strength * 2.2, delay)
})
