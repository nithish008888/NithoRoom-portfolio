import type { ThreeEvent } from '@react-three/fiber'
import { useMemo } from 'react'
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { music, startMusic } from '../audio/music'
import { emit } from '../lib/events'
import { go } from '../state/router'
import { useStore, type View } from '../state/store'
import { registry } from './registry'

type Spot = { id: string; object: string; view: View; label: string; pad?: number }

/** Clickable props that move the camera. Invisible boxes give generous, stable hit areas. */
export const SPOTS: Spot[] = [
  { id: 'tv', object: 'TV_Shell', view: 'tv', label: 'WATCH TV', pad: 0.005 },
  { id: 'computer', object: 'Computer_Shell', view: 'about', label: 'USE COMPUTER · ABOUT', pad: 0.01 },
  { id: 'cd', object: 'CDPlayer', view: 'music', label: 'CD PLAYER · PLAY MUSIC', pad: 0.025 },
]

export function Hotspots() {
  const sceneReady = useStore((s) => s.sceneReady)
  const meshes = useMemo(
    () =>
      SPOTS.map((s) => {
        const o = registry.get(s.object)
        if (!o) return null
        const box = new Box3().setFromObject(o)
        box.expandByScalar(s.pad ?? 0)
        const size = box.getSize(new Vector3())
        const m = new Mesh(new BoxGeometry(size.x, size.y, size.z), new MeshBasicMaterial({ visible: false }))
        box.getCenter(m.position)
        m.name = `Hotspot:${s.id}`
        m.userData.box = box
        registry.objects.set(m.name, m)
        return { spot: s, mesh: m }
      }).filter(Boolean) as { spot: Spot; mesh: Mesh }[],
    [sceneReady], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const over = (e: ThreeEvent<PointerEvent>, s: Spot) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.phase !== 'entered' || st.view === s.view) return
    const label = s.id === 'cd' && music.playing ? 'CD PLAYER · MUSIC' : s.label
    st.setHover({ id: s.id, label: st.view === 'work' && s.id !== 'tv' ? 'PUT DOWN NOTEPAD' : label })
    document.body.style.cursor = 'pointer'
  }
  const out = (s: Spot) => {
    const st = useStore.getState()
    if (st.hover?.id === s.id) st.setHover(null)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>, s: Spot) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.phase !== 'entered') return
    emit('ui:click')
    // the Discman plays straight away (through the desk speakers) as well as opening its controls
    if (s.id === 'cd' && !music.playing) void startMusic()
    if (st.view === s.view) return
    // while reading the notepad, a click elsewhere puts it down first (like the reference)
    if (st.view === 'work' && s.id !== 'tv') go('overview')
    else go(s.view)
  }

  return (
    <>
      {meshes.map(({ spot, mesh }) => (
        <primitive key={spot.id} object={mesh} onPointerOver={(e: ThreeEvent<PointerEvent>) => over(e, spot)} onPointerOut={() => out(spot)} onClick={(e: ThreeEvent<MouseEvent>) => click(e, spot)} />
      ))}
    </>
  )
}
