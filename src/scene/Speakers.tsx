import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three'
import { music, pauseMusic, startMusic } from '../audio/music'
import { placeSpeakers, speakerLevels, syncListener } from '../audio/speakers'
import { emit } from '../lib/events'
import { useStore } from '../state/store'
import { registry } from './registry'

type Unit = { cone: Object3D; rest: Vector3; dir: Vector3; led: Mesh | null; ledMat: MeshBasicMaterial; hit: Mesh }

/**
 * The two desk speakers: the music's positional sources sit on their woofers, the cones pump with the
 * low end, the power LEDs glow while the disc plays, and a click on either one plays / pauses.
 */
export function Speakers() {
  const sceneReady = useStore((s) => s.sceneReady)
  const camera = useThree((s) => s.camera)
  const pump = useRef(0)
  const lit = useRef(0)

  const units = useMemo(() => {
    const out: Unit[] = []
    for (const side of ['L', 'R'] as const) {
      const cone = registry.get(`Speaker_${side}_Cone`)
      const front = registry.get(`SpeakerFront_${side}`)
      const body = registry.get(`Speaker_${side}`)
      if (!cone || !front || !body) continue
      const rest = cone.position.clone()
      const dir = front.getWorldPosition(new Vector3()).sub(cone.getWorldPosition(new Vector3())).normalize()
      const led = (registry.get<Mesh>(`Speaker_${side}_LED`) as Mesh | undefined) ?? null
      const ledMat = new MeshBasicMaterial({ color: '#ff9a3a' })
      if (led) led.material = ledMat
      const box = new Box3().setFromObject(body).expandByScalar(0.01)
      const hit = new Mesh(new BoxGeometry(...box.getSize(new Vector3()).toArray()), new MeshBasicMaterial({ visible: false }))
      box.getCenter(hit.position)
      hit.name = `Hotspot:speaker${side}`
      registry.objects.set(hit.name, hit)
      out.push({ cone, rest, dir, led, ledMat, hit })
    }
    if (out.length === 2) {
      placeSpeakers(
        { pos: out[0]!.cone.getWorldPosition(new Vector3()), dir: out[0]!.dir },
        { pos: out[1]!.cone.getWorldPosition(new Vector3()), dir: out[1]!.dir },
      )
    }
    return out
  }, [sceneReady]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    if (!units.length) return
    syncListener(camera)
    const playing = music.playing
    const { bass, level } = playing ? speakerLevels() : { bass: 0, level: 0 }
    const k = Math.min(1, dt * 18)
    pump.current += (bass - pump.current) * k
    lit.current += ((playing ? 0.55 + level * 1.6 : 0.06) - lit.current) * Math.min(1, dt * 8)
    for (const u of units) {
      u.cone.position.copy(u.rest).addScaledVector(u.dir, pump.current * pump.current * 0.0024)
      u.ledMat.color.setRGB(1.0 * lit.current, 0.55 * lit.current, 0.18 * lit.current)
    }
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.phase !== 'entered') return
    st.setHover({ id: 'speakers', label: music.playing ? 'PAUSE MUSIC' : 'PLAY MUSIC' })
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    const st = useStore.getState()
    if (st.hover?.id === 'speakers') st.setHover(null)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const st = useStore.getState()
    if (st.phase !== 'entered') return
    emit('ui:click')
    if (music.playing) pauseMusic()
    else void startMusic()
    st.setHover({ id: 'speakers', label: music.playing ? 'PAUSE MUSIC' : 'PLAY MUSIC' })
  }

  return (
    <>
      {units.map((u) => (
        <primitive key={u.hit.name} object={u.hit} onPointerOver={over} onPointerOut={out} onClick={click} />
      ))}
    </>
  )
}
