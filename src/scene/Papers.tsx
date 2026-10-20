import { useMemo } from 'react'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { useStore } from '../state/store'
import { Liftable } from './Liftable'
import { registry } from './registry'
import { ContactCard, CARD_H, CARD_W } from './screens/contact'
import { ResumePage, RES_H, RES_W } from './screens/resume'

export const resumePage = new ResumePage()
export const contactCard = new ContactCard()

const CARD = [0.152, 0.096] as const

/** The résumé printout (from room.glb) and a contact index card resting on the note pad. */
export function Papers() {
  const sceneReady = useStore((s) => s.sceneReady)
  const resume = sceneReady ? registry.get('Resume') : undefined
  const resumeFace = sceneReady ? registry.get<Mesh>('Resume_PageMesh') : undefined

  const card = useMemo(() => {
    if (!sceneReady) return null
    const g = new Group()
    g.name = 'ContactCard'
    const body = new Mesh(new BoxGeometry(CARD[0], 0.0007, CARD[1]), new MeshStandardMaterial({ color: '#efece3', roughness: 0.85 }))
    body.position.y = 0.00035
    body.castShadow = body.receiveShadow = true
    const geo = new PlaneGeometry(CARD[0] - 0.001, CARD[1] - 0.001)
    // canvas row 0 (top) is v = 0 for our textures: put it on the far edge when the card lies flat
    const uv = geo.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    const face = new Mesh(geo, new MeshStandardMaterial({ map: contactCard.texture, roughness: 0.8, emissiveMap: contactCard.texture, emissive: 0xffffff, emissiveIntensity: 0 }))
    face.rotation.x = -Math.PI / 2
    face.position.y = 0.00075
    face.receiveShadow = true
    g.add(body, face)
    const stack = registry.get('Notes_note_stack')
    if (stack) {
      stack.updateWorldMatrix(true, false)
      g.position.set(stack.position.x + 0.004, 0.7605 + 0.0102, stack.position.z + 0.002)
      g.rotation.y = 0.05
    } else g.position.set(-0.335, 0.771, 0.17)
    registry.get('Tape')?.parent?.add(g)
    return { g, face }
  }, [sceneReady])

  return (
    <>
      <Liftable
        object={resume}
        page={resumeFace}
        view="resume"
        anchor="resume"
        canvasSize={[RES_W, RES_H]}
        size={[0.21, 0.297]}
        fill={0.9}
        hoverLabel="READ RÉSUMÉ"
        onFrame={(k) => {
          const m = resumeFace?.material as MeshStandardMaterial | undefined
          if (m) m.emissiveIntensity = 0.14 * k
        }}
      />
      {card && (
        <Liftable
          object={card.g}
          page={card.face}
          view="contact"
          anchor="contact"
          canvasSize={[CARD_W, CARD_H]}
          size={[CARD[0], CARD[1]]}
          fill={0.62}
          hoverLabel="CONTACT CARD"
          onFrame={(k) => {
            ;(card.face.material as MeshStandardMaterial).emissiveIntensity = 0.16 * k
          }}
        />
      )}
    </>
  )
}
