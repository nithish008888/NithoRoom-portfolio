import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export type View = 'overview' | 'work' | 'about' | 'resume' | 'contact' | 'music' | 'tv'
export type Phase = 'loading' | 'ready' | 'entering' | 'entered'
export type VcrStatus = 'empty' | 'inserting' | 'loading' | 'playing' | 'ejecting'

export type Hover = { id: string; label: string } | null

export interface MusicState {
  playing: boolean
  track: number
  volume: number
  elapsed: number
  duration: number
  loading: boolean
}

interface State {
  phase: Phase
  /** 0..1 asset loading progress */
  progress: number
  view: View
  /** project whose tape is requested in the VCR (null = no tape) */
  project: string | null
  sound: boolean
  reducedMotion: boolean
  /** small screens / weak GPUs: fewer effects, lower DPR */
  lowPower: boolean
  hover: Hover
  /** actual VCR state, owned by the tape controller (lags behind `project` while tapes move) */
  vcr: { tape: string | null; status: VcrStatus }
  /** keyboard-focused hotspot id (draws the in-world focus ring) */
  focus: string | null
  music: MusicState
  /** camera transition in progress (UI fades labels while moving) */
  moving: boolean
  /** room.glb parsed and the object registry filled */
  sceneReady: boolean
}

interface Actions {
  set: (p: Partial<State>) => void
  setHover: (h: Hover) => void
  setVcr: (v: Partial<State['vcr']>) => void
  setMusic: (m: Partial<MusicState>) => void
}

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const useStore = create<State & Actions>()(
  subscribeWithSelector((set) => ({
    phase: 'loading',
    progress: 0,
    view: 'overview',
    project: null,
    sound: false,
    reducedMotion: !!prefersReducedMotion,
    lowPower: false,
    hover: null,
    vcr: { tape: null, status: 'empty' },
    focus: null,
    music: { playing: false, track: 0, volume: 0.7, elapsed: 0, duration: 0, loading: false },
    moving: false,
    sceneReady: false,
    set: (p) => set(p),
    setHover: (hover) => set((s) => (s.hover?.id === hover?.id && s.hover?.label === hover?.label ? s : { hover })),
    setVcr: (v) => set((s) => ({ vcr: { ...s.vcr, ...v } })),
    setMusic: (m) => set((s) => ({ music: { ...s.music, ...m } })),
  })),
)

if (typeof window !== 'undefined') {
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) =>
    useStore.getState().set({ reducedMotion: e.matches }),
  )
}
