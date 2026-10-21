import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three'
import { damp } from '../lib/anim'
import { emit } from '../lib/events'
import { backToDesk } from '../state/router'
import { useStore } from '../state/store'
import { toggleLamp, toggleTube } from './lighting'
import { registry } from './registry'

type Control = { id: 'switch' | 'lamp'; object: string; pad: number }
const CONTROLS: Control[] = [
  { id: 'switch', object: 'SwitchBoard', pad: 0.025 },
  { id: 'lamp', object: 'Lamp', pad: 0.01 },
]

export function controlLabel(id: Control['id']) {
  const l = useStore.getState().lights
  return id === 'switch' ? `LIGHT SWITCH · TURN ${l.tube ? 'OFF' : 'ON'}` : `DESK LAMP · TURN ${l.lamp ? 'OFF' : 'ON'}`
}

const ROCK = (12 * Math.PI) / 180 // the rocker tips 12° between off and on
const X = new Vector3(1, 0, 0)

/**
 * The wall switch above the computer (tube light) and the desk lamp: click to switch. The switch's
 * rocker is its own object in the model (Switch_Light) so it visibly flips.
 */
export function LightControls() {
  const sceneReady = useStore((s) => s.sceneReady)
  const rock = useRef(0)
  const q = useMemo(() => new Quaternion(), [])

  const parts = useMemo(() => {
    const hits = CONTROLS.map((c) => {
      const o = registry.get(c.object)
      if (!o) return null
      const box = new Box3().setFromObject(o).expandByScalar(c.pad)
      const m = new Mesh(new BoxGeometry(...box.getSize(new Vector3()).toArray()), new MeshBasicMaterial({ visible: false }))
      box.getCenter(m.position)
      m.name = `Hotspot:${c.id}`
      registry.objects.set(m.name, m)
      return { c, m }
    }).filter(Boolean) as { c: Control; m: Mesh }[]
    const rocker = registry.get<Object3D>('Switch_Light') ?? null
    return { hits, rocker, rest: rocker ? rocker.quaternion.clone() : null }
  }, [sceneReady]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const { rocker, rest } = parts
    if (!rocker || !rest) return
    rock.current = damp(rock.current, useStore.getState().lights.tube ? 1 : 0, 40, Math.min(dt, 0.05))
    rocker.quaternion.copy(rest).multiply(q.setFromAxisAngle(X, rock.current * ROCK))
  })

  const over = (e: ThreeEvent<PointerEvent>, c: Control) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.phase !== 'entered') return
    st.setHover({ id: c.id, label: st.view === 'work' ? 'PUT DOWN NOTEPAD' : controlLabel(c.id) })
    document.body.style.cursor = 'pointer'
  }
  const out = (c: Control) => {
    const st = useStore.getState()
    if (st.hover?.id === c.id) st.setHover(null)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>, c: Control) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.phase !== 'entered') return
    // while reading the notepad, a click elsewhere puts it down first
    if (st.view === 'work') {
      emit('ui:click')
      backToDesk()
      return
    }
    if (c.id === 'switch') toggleTube()
    else toggleLamp()
    st.setHover({ id: c.id, label: controlLabel(c.id) })
  }

  return (
    <>
      {parts.hits.map(({ c, m }) => (
        <primitive
          key={c.id}
          object={m}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => over(e, c)}
          onPointerOut={() => out(c)}
          onClick={(e: ThreeEvent<MouseEvent>) => click(e, c)}
        />
      ))}
    </>
  )
}
