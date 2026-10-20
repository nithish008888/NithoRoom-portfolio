/**
 * Interruptible tweens.
 *
 * A Tween moves an n-dimensional value to a target along a quintic Hermite
 * curve (zero velocity *and* acceleration at the end). Retargeting mid-flight
 * starts the new curve from the current value with the current velocity, so a
 * rapid series of clicks bends the motion smoothly instead of snapping.
 */
export class Tween {
  readonly value: number[]
  readonly velocity: number[]
  private from: number[]
  private to: number[]
  private v0: number[]
  private t = 1
  private dur = 1

  constructor(initial: number[]) {
    this.value = initial.slice()
    this.velocity = initial.map(() => 0)
    this.from = initial.slice()
    this.to = initial.slice()
    this.v0 = initial.map(() => 0)
  }

  get active() {
    return this.t < 1
  }

  get target() {
    return this.to
  }

  /** Start moving towards `to` over `duration` seconds (0 = jump). */
  retarget(to: number[], duration: number) {
    if (duration <= 0) {
      this.jump(to)
      return
    }
    this.from = this.value.slice()
    this.v0 = this.velocity.slice()
    this.to = to.slice()
    this.dur = duration
    this.t = 0
  }

  jump(to: number[]) {
    for (let i = 0; i < this.value.length; i++) {
      this.value[i] = to[i]!
      this.velocity[i] = 0
    }
    this.from = to.slice()
    this.to = to.slice()
    this.t = 1
  }

  update(dt: number) {
    if (this.t >= 1) return false
    this.t = Math.min(1, this.t + dt / this.dur)
    const t = this.t
    const t2 = t * t
    const t3 = t2 * t
    const t4 = t3 * t
    const t5 = t4 * t
    // quintic Hermite basis with a0 = a1 = 0, v1 = 0
    const h0 = 1 - 10 * t3 + 15 * t4 - 6 * t5
    const h1 = t - 6 * t3 + 8 * t4 - 3 * t5
    const h5 = 10 * t3 - 15 * t4 + 6 * t5
    const d0 = -30 * t2 + 60 * t3 - 30 * t4
    const d1 = 1 - 18 * t2 + 32 * t3 - 15 * t4
    const d5 = 30 * t2 - 60 * t3 + 30 * t4
    for (let i = 0; i < this.value.length; i++) {
      const m0 = this.v0[i]! * this.dur
      this.value[i] = h0 * this.from[i]! + h1 * m0 + h5 * this.to[i]!
      this.velocity[i] = t >= 1 ? 0 : (d0 * this.from[i]! + d1 * m0 + d5 * this.to[i]!) / this.dur
    }
    return true
  }
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return target + (current - target) * Math.exp(-lambda * dt)
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
