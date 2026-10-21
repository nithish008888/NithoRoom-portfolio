import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Vector3 } from 'three'
import { projects } from '../content/site'
import { useStore } from '../state/store'
import { anchors } from './anchors'
import { registry } from './registry'

/**
 * Objects that keyboard users can focus (see ui/HotspotButtons.tsx): in the overview unless `in` says
 * otherwise. `view` is where they lead; `toggle` ones switch a light instead.
 */
export const FOCUS_SPOTS = [
  { id: 'notepad', object: 'Notepad', label: 'Work — pick up the notepad', view: 'work' },
  { id: 'tv', object: 'TV_Shell', label: 'Watch the television', view: 'tv' },
  { id: 'computer', object: 'Computer_Shell', label: 'About me — use the old computer', view: 'about' },
  { id: 'resume', object: 'Resume', label: 'Read the résumé printout', view: 'resume' },
  { id: 'contact', object: 'ContactCard', label: 'Contact card', view: 'contact' },
  { id: 'cd', object: 'CDPlayer', label: 'CD player — music', view: 'music' },
  ...projects.map((p, i) => ({ id: `tape:${p.id}`, object: `Tape:${p.id}`, label: `Play tape ${String(i + 1).padStart(2, '0')}: ${p.title}`, view: 'work' as const, project: p.id })),
  { id: 'lamp', object: 'Lamp', label: 'Desk lamp', view: 'overview', toggle: 'lamp' },
  { id: 'switch', object: 'SwitchBoard', label: 'Light switch', view: 'about', toggle: 'tube', in: 'about' },
] as const

const box = new Box3()
const v = new Vector3()

/** Publishes each focusable object's screen rectangle as an anchor quad every frame. */
export function SpotAnchors() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useFrame(() => {
    const s = useStore.getState()
    if (!s.sceneReady || s.phase !== 'entered' || !s.focus?.startsWith('spot:')) return
    const id = s.focus.slice(5)
    const spot = FOCUS_SPOTS.find((f) => f.id === id)
    const o = spot && registry.get(spot.object)
    if (!o) return
    box.setFromObject(o)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera)
      const sx = ((v.x + 1) / 2) * size.width
      const sy = ((1 - v.y) / 2) * size.height
      x0 = Math.min(x0, sx)
      y0 = Math.min(y0, sy)
      x1 = Math.max(x1, sx)
      y1 = Math.max(y1, sy)
    }
    const pad = 6
    anchors.set(`spot:${id}`, {
      pts: [
        [x0 - pad, y0 - pad],
        [x1 + pad, y0 - pad],
        [x1 + pad, y1 + pad],
        [x0 - pad, y1 + pad],
      ],
      visible: true,
      w: 100,
      h: 100,
    })
  })
  return null
}
