/**
 * The two desk speakers. The CD player's signal is split into left and right, and each channel plays
 * from a positional (HRTF) panner at its speaker while the listener rides on the camera — so the music
 * comes from the desk and shifts as the view moves. An analyser drives the woofer cones and the LEDs.
 */
import { Vector3, type Camera } from 'three'
import { audioContext, audioOut } from './audio'

export type SpeakerPose = { pos: Vector3; dir: Vector3 }

let input: GainNode | null = null
let analyser: AnalyserNode | null = null
let panners: [PannerNode, PannerNode] | null = null
let poses: [SpeakerPose, SpeakerPose] | null = null
const spectrum = new Uint8Array(128)
const fwd = new Vector3()
const up = new Vector3()
const pos = new Vector3()

function setParam(p: AudioParam | undefined, v: number, ctx: BaseAudioContext) {
  if (p) p.setTargetAtTime(v, ctx.currentTime, 0.02)
}

function apply() {
  const ctx = audioContext()
  if (!ctx || !panners || !poses) return
  panners.forEach((p, i) => {
    const { pos: q, dir } = poses![i]!
    if (p.positionX) {
      setParam(p.positionX, q.x, ctx)
      setParam(p.positionY, q.y, ctx)
      setParam(p.positionZ, q.z, ctx)
      setParam(p.orientationX, dir.x, ctx)
      setParam(p.orientationY, dir.y, ctx)
      setParam(p.orientationZ, dir.z, ctx)
    } else {
      p.setPosition(q.x, q.y, q.z)
      p.setOrientation(dir.x, dir.y, dir.z)
    }
  })
}

/** Where the music goes in. Created on first use (needs the AudioContext from a user gesture). */
export function speakerInput(): AudioNode | null {
  const ctx = audioContext()
  const out = audioOut()
  if (!ctx || !out) return null
  if (!input) {
    input = ctx.createGain()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.55
    input.connect(analyser)
    const split = ctx.createChannelSplitter(2)
    input.connect(split)
    const make = () => {
      const p = ctx.createPanner()
      p.panningModel = 'HRTF'
      p.distanceModel = 'inverse'
      p.refDistance = 0.8
      p.rolloffFactor = 0.7
      // the drivers face the chair: quieter (not silent) from behind
      p.coneInnerAngle = 150
      p.coneOuterAngle = 320
      p.coneOuterGain = 0.5
      p.connect(out)
      return p
    }
    panners = [make(), make()]
    split.connect(panners[0], 0)
    split.connect(panners[1], 1)
    apply()
  }
  return input
}

/** World positions and facing of the left and right drivers (from the room model). */
export function placeSpeakers(left: SpeakerPose, right: SpeakerPose) {
  poses = [left, right]
  apply()
}

/** Keep the WebAudio listener on the camera. */
export function syncListener(camera: Camera) {
  const ctx = audioContext()
  if (!ctx || !input) return
  const l = ctx.listener
  camera.getWorldPosition(pos)
  camera.getWorldDirection(fwd)
  up.set(0, 1, 0).applyQuaternion(camera.quaternion)
  if (l.positionX) {
    setParam(l.positionX, pos.x, ctx)
    setParam(l.positionY, pos.y, ctx)
    setParam(l.positionZ, pos.z, ctx)
    setParam(l.forwardX, fwd.x, ctx)
    setParam(l.forwardY, fwd.y, ctx)
    setParam(l.forwardZ, fwd.z, ctx)
    setParam(l.upX, up.x, ctx)
    setParam(l.upY, up.y, ctx)
    setParam(l.upZ, up.z, ctx)
  } else {
    l.setPosition(pos.x, pos.y, pos.z)
    l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z)
  }
}

/** 0..1 levels of what the speakers are playing right now: low end (cones) and overall (LEDs). */
export function speakerLevels(): { bass: number; level: number } {
  if (!analyser) return { bass: 0, level: 0 }
  analyser.getByteFrequencyData(spectrum)
  let b = 0
  for (let i = 1; i < 4; i++) b += spectrum[i]!
  let all = 0
  for (let i = 1; i < 64; i++) all += spectrum[i]!
  return { bass: b / (3 * 255), level: all / (63 * 255) }
}
