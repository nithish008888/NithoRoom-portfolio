import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { canvasTexture, makeCanvas, setFont } from '../lib/canvas'
import { F } from '../lib/fonts'
import { useStore } from '../state/store'

// Discman LCD position (CDPlayer group at Blender (-0.665, -0.715) rotated 18°, LCD at local (0, -0.046, 0.0258))
const LCD_POS: [number, number, number] = [-0.6508, 0.7864, 0.7587]
const LCD_YAW = (18 * Math.PI) / 180

/** The Discman's little LCD mirrors the CD panel: track number and elapsed time. */
export function CDPlayerLCD() {
  const lcd = useMemo(() => {
    const { canvas, ctx } = makeCanvas(256, 96)
    const tex = canvasTexture(canvas, { mipmaps: false })
    const mat = new MeshBasicMaterial({ map: tex })
    const geo = new PlaneGeometry(0.032, 0.011)
    const uv = geo.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    const mesh = new Mesh(geo, mat)
    mesh.position.set(...LCD_POS)
    mesh.rotation.set(-Math.PI / 2, 0, LCD_YAW)
    return { canvas, ctx, tex, mat, mesh, key: '' }
  }, [])

  useFrame(() => {
    const m = useStore.getState().music
    const key = `${m.track}|${Math.floor(m.elapsed)}|${m.playing}|${m.loading}`
    if (key === lcd.key) return
    lcd.key = key
    const c = lcd.ctx
    c.fillStyle = m.playing ? '#9fb88a' : '#7f906f'
    c.fillRect(0, 0, 256, 96)
    c.fillStyle = 'rgba(20,28,16,0.9)'
    setFont(c, `56px ${F.term}`)
    const t = `${Math.floor(m.elapsed / 60)}:${String(Math.floor(m.elapsed % 60)).padStart(2, '0')}`
    c.fillText(m.loading ? 'LOAD' : String(m.track + 1).padStart(2, '0'), 14, 66)
    c.textAlign = 'right'
    c.fillText(m.playing || m.elapsed ? t : '--:--', 244, 66)
    c.textAlign = 'left'
    setFont(c, `22px ${F.term}`)
    c.fillText(m.playing ? '▶ PLAY' : '■', 14, 90)
    lcd.tex.needsUpdate = true
    lcd.mat.color.setScalar(m.playing ? 0.62 : 0.45)
  })

  return <primitive object={lcd.mesh} />
}
