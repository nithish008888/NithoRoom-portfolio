import { Vector4 } from 'three'
import { damp } from '../lib/anim'
import { emit } from '../lib/events'
import { useStore } from '../state/store'

/**
 * Switchable light in a baked room. Every lightmapped surface sums four light layers baked separately in
 * Cycles (blender/bake_export.py): base (room fill, LEDs), window (the night outside), lamp and tube. These
 * weights are one uniform shared by all of those materials, so switching a light relights the whole room
 * with real bounce and shadows, at no cost.
 */
export const layerWeights = { value: new Vector4(1, 1, 1, 0) } // x base, y window, z lamp, w tube

/** Current light levels, read by the realtime lights, the avatar, the steam and the dust in the lamp beam. */
export const levels = { lamp: 1, tube: 0, flash: 0 }

/** Brightness of the window layer during a lightning flash (on top of its normal 1). */
const FLASH_GAIN = 22
/** How bright the switched lights are relative to their bake (tuned by eye). */
export const gains = { tube: 2.4 }

type Step = [duration: number, level: number]
let tubeSteps: Step[] = []
let stepT = 0
let tubeWas = false
const pulses: [at: number, amp: number][] = []
let clock = 0
let nextStrike = 28 + Math.random() * 30

/** A fluorescent tube's start: one or two blinks (with the starter's tink), then it holds. */
function startFlicker() {
  const steps: Step[] = [[0.05 + Math.random() * 0.08, 0]]
  const blinks = 1 + Math.floor(Math.random() * 2)
  for (let i = 0; i < blinks; i++) {
    steps.push([0.04 + Math.random() * 0.05, 0.45 + Math.random() * 0.45])
    steps.push([0.07 + Math.random() * 0.2, 0.04])
  }
  tubeSteps = steps
  stepT = 0
}

export function toggleTube(on = !useStore.getState().lights.tube) {
  emit('switch', on)
  useStore.getState().setLights({ tube: on })
}

export function toggleLamp(on = !useStore.getState().lights.lamp) {
  emit('lamp:click', on)
  useStore.getState().setLights({ lamp: on })
}

/** Lightning far over the city: two quick pulses (well under the three-flashes-a-second limit), thunder later. */
export function strike() {
  pulses.push([clock, 0.55 + Math.random() * 0.3], [clock + 0.16 + Math.random() * 0.14, 0.8 + Math.random() * 0.2])
  emit('thunder', { delay: 1.2 + Math.random() * 2.6, strength: 0.6 + Math.random() * 0.4 })
}

/** Advances the light levels; called once per frame by <Systems/>. */
export function updateLighting(dt: number) {
  const s = useStore.getState()
  clock += dt
  const reduced = s.reducedMotion

  // tube light: flicker on (a plain fade under reduced motion), snap off with a short afterglow
  const tubeOn = s.lights.tube
  if (tubeOn && !tubeWas) {
    if (reduced) tubeSteps = []
    else startFlicker()
  } else if (!tubeOn) tubeSteps = [] // switched off mid-blink
  tubeWas = tubeOn
  if (tubeOn && tubeSteps.length) {
    const step = tubeSteps[0]!
    if (stepT === 0 && step[1] > 0.3) emit('tube:tink')
    levels.tube = step[1]
    stepT += dt
    if (stepT >= step[0]) {
      tubeSteps.shift()
      stepT = 0
    }
  } else {
    levels.tube = damp(levels.tube, tubeOn ? 1 : 0, tubeOn ? (reduced ? 6 : 22) : 26, dt)
  }

  // lamp: the filament warms up quickly and fades a little slower
  levels.lamp = damp(levels.lamp, s.lights.lamp ? 1 : 0, s.lights.lamp ? 16 : 9, dt)

  // lightning while someone is in the room (never under reduced motion or in a hidden tab)
  if (s.phase === 'entered' && !reduced && !document.hidden && clock > nextStrike) {
    strike()
    nextStrike = clock + 35 + Math.random() * 55
  } else if (s.phase !== 'entered' && clock > nextStrike) nextStrike = clock + 20
  let flash = 0
  for (let i = pulses.length - 1; i >= 0; i--) {
    const [at, amp] = pulses[i]!
    const t = clock - at
    if (t > 1) pulses.splice(i, 1)
    else if (t >= 0) flash += amp * (t < 0.025 ? t / 0.025 : Math.exp(-(t - 0.025) / 0.07))
  }
  levels.flash = flash

  const w = layerWeights.value
  w.x = 1
  w.y = 1 + flash * FLASH_GAIN
  w.z = levels.lamp
  w.w = levels.tube * gains.tube
}

/** True while a light is still changing (the reflections are captured again once it settles). */
export function lightsSettling() {
  const s = useStore.getState().lights
  return tubeSteps.length > 0 || Math.abs(levels.lamp - (s.lamp ? 1 : 0)) > 0.002 || Math.abs(levels.tube - (s.tube ? 1 : 0)) > 0.002
}
