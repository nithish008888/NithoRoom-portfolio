import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { useLayoutEffect, useState } from 'react'
import {
  Box3,
  Color,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type Object3D,
  type ShaderMaterial,
  type Texture,
} from 'three'
import { site } from '../content/site'
import { canvasTexture } from '../lib/canvas'
import { useStore } from '../state/store'
import lightmaps from './lightmaps.json'
import { makeBaked } from './materials/baked'
import { makeCRT } from './materials/crt'
import { makeWindowGlass } from './materials/windowGlass'
import { registry } from './registry'
import { screens } from './screens'
import * as print from './screens/print'
import { resumePage } from './Papers'

type Manifest = { atlases: Record<string, { file: string; scale: number }>; objects: Record<string, string> }
const LM = lightmaps as unknown as Manifest

/** Shader materials that receive the captured room cubemap once it exists. */
export const envReceivers: ShaderMaterial[] = []
/** Custom materials driven every frame by <Systems/>. */
export const mats: { glass?: ShaderMaterial; crt?: ShaderMaterial; pc?: ShaderMaterial } = {}

/** Per-material adjustments on top of the glTF values (keys are Blender material names). */
const TWEAK: Record<string, Partial<MeshPhysicalMaterial>> = {
  // varnished wood: a hint of sheen only (strong grazing reflections turned the desk lavender)
  M_Desk: { envMapIntensity: 0.14, roughness: 0.5, clearcoat: 0.07, clearcoatRoughness: 0.42 },
  M_DeskFrame: { envMapIntensity: 0.12, clearcoat: 0 },
  M_Ceramic: { envMapIntensity: 0.9, roughness: 0.14, clearcoat: 0.3 },
  M_Coffee: { envMapIntensity: 0.18, roughness: 0.3 },
  M_Brass: { envMapIntensity: 1.6 },
  M_Chrome: { envMapIntensity: 1.6 },
  M_Steel: { envMapIntensity: 1.4 },
  M_TVPlastic: { envMapIntensity: 0.3, roughness: 0.48 },
  M_VCRBody: { envMapIntensity: 0.25 },
  M_VCRFront: { envMapIntensity: 0.6, roughness: 0.22 },
  M_LampPaint: { envMapIntensity: 0.22, clearcoat: 0.05 },
  M_Wall: { envMapIntensity: 0.05 },
  M_Ceiling: { envMapIntensity: 0.04 },
  M_Curtain: { envMapIntensity: 0.03 },
  M_Floor: { envMapIntensity: 0.25 },
  M_WindowFrame: { envMapIntensity: 0.18, clearcoat: 0.03 },
  M_Sill: { envMapIntensity: 0.18, clearcoat: 0.03 },
  M_SideDesk: { envMapIntensity: 0.15, clearcoat: 0.03 },
  M_Discman: { envMapIntensity: 0.8 },
  M_Beige: { envMapIntensity: 0.25 },
  M_Keycap: { envMapIntensity: 0.2 },
  M_RemoteBody: { envMapIntensity: 0.6 },
}

const DECALS: Record<string, [() => HTMLCanvasElement, number]> = {
  TV_DecalTop: [print.tvTop, 0.32],
  TV_DecalBottom: [print.tvBottom, 0.26],
  VCR_DecalTop: [print.vcrTop, 0.24],
  VCR_DecalBottom: [print.vcrBottom, 0.24],
  PC_Decal: [print.pcBadge, 0.55],
  CD_Decal: [print.cdLid, 0.45],
}

function ownerName(o: Object3D): string {
  let p: Object3D | null = o
  while (p) {
    if (LM.objects[p.name]) return p.name
    p = p.parent
  }
  return ''
}

function within(o: Object3D, prefix: string) {
  let p: Object3D | null = o
  while (p) {
    if (p.name.startsWith(prefix)) return true
    p = p.parent
  }
  return false
}

export function Room() {
  const gltf = useLoader(GLTFLoader, MODEL_URL, (l) => l.setMeshoptDecoder(MeshoptDecoder))
  const atlasNames = Object.keys(LM.atlases)
  const lmList = useLoader(TextureLoader, atlasNames.map((k) => '/' + LM.atlases[k]!.file))
  const lm = Object.fromEntries(atlasNames.map((k, i) => [k, lmList[i]!])) as Record<string, Texture>
  // chosen once at mount: a later switch to the light renderer must not reload the panorama
  // (that would suspend the room and rebuild every material)
  const [cityUrl] = useState(() => (useStore.getState().lowPower ? '/textures/city_sm.webp' : '/textures/city.webp'))
  const city = useLoader(TextureLoader, cityUrl)
  const posterPhoto = useLoader(TextureLoader, site.decor.poster.photo)

  useLayoutEffect(() => {
    for (const t of Object.values(lm)) {
      t.flipY = false
      t.colorSpace = SRGBColorSpace
      t.channel = 1
      t.needsUpdate = true
    }
    city.colorSpace = SRGBColorSpace
    city.generateMipmaps = true
    city.minFilter = LinearMipmapLinearFilter
    city.anisotropy = 4
    city.needsUpdate = true

    const glass = makeWindowGlass(city)
    const crt = makeCRT(screens.tv.texture)
    envReceivers.push(glass, crt)
    mats.glass = glass
    mats.crt = crt
    const fairyBulb = new MeshBasicMaterial({ color: new Color(1.0, 0.72, 0.4).multiplyScalar(2.2) })
    const cache = new Map<string, Material>()
    // thin, clear lenses (the glTF transmission material reads as black sunglasses here)
    const lens = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.1, envMapIntensity: 1.6, depthWrite: false })
    const baked = (mat: Material, atlas: string) => {
      if (/_glass$/.test(mat.name)) return lens
      const key = `${mat.uuid}:${atlas}`
      let m = cache.get(key)
      if (!m) {
        const a = LM.atlases[atlas]!
        const bm = makeBaked(mat as MeshStandardMaterial, lm[atlas]!, Math.PI * a.scale)
        Object.assign(bm, { envMapIntensity: Math.min(bm.envMapIntensity, 0.35) }, TWEAK[mat.name] ?? {})
        m = bm
        cache.set(key, m)
      }
      return m
    }

    gltf.scene.traverse((o) => {
      if (o.name) registry.objects.set(o.name, o)
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const name = mesh.name
      mesh.castShadow = false
      mesh.receiveShadow = false

      if (within(mesh, 'Glass_')) {
        mesh.material = glass
        return
      }
      if (within(mesh, 'TV_Screen')) {
        mesh.material = crt
        registry.objects.set('TV_ScreenMesh', mesh)
        return
      }
      if (within(mesh, 'PC_Screen')) {
        registry.objects.set('PC_ScreenMesh', mesh)
        return // material assigned by <Terminal/>
      }
      if (within(mesh, 'VCR_Display')) {
        const m = new MeshBasicMaterial({ map: screens.vfd.texture })
        m.color.setScalar(1.6)
        mesh.material = m
        return
      }
      const decal = Object.keys(DECALS).find((k) => within(mesh, k))
      if (decal) {
        const [draw, k] = DECALS[decal]!
        const m = new MeshBasicMaterial({ map: canvasTexture(draw()), transparent: true, depthWrite: false })
        m.color.setScalar(k)
        m.polygonOffset = true
        m.polygonOffsetFactor = -2
        mesh.material = m
        mesh.renderOrder = 2
        return
      }
      if (within(mesh, 'Tape')) {
        return // template, cloned by <Tapes/>
      }
      if (within(mesh, 'Notepad_Page')) {
        mesh.material = new MeshStandardMaterial({
          map: screens.notepad.texture,
          roughness: 0.92,
          emissiveMap: screens.notepad.texture,
          emissive: 0xffffff,
          emissiveIntensity: 0,
          envMapIntensity: 0.15,
        })
        registry.objects.set('Notepad_PageMesh', mesh)
        mesh.receiveShadow = true
        return
      }
      if (within(mesh, 'Resume_Page')) {
        mesh.material = new MeshStandardMaterial({ map: resumePage.texture, roughness: 0.85, emissiveMap: resumePage.texture, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 0.15 })
        mesh.receiveShadow = true
        registry.objects.set('Resume_PageMesh', mesh)
        return
      }
      if (within(mesh, 'Notepad') || within(mesh, 'Resume') || within(mesh, 'VCR_Door')) {
        mesh.receiveShadow = true
        mesh.castShadow = true
        const m = mesh.material as MeshStandardMaterial
        m.envMapIntensity = 0.4
        return
      }
      if (within(mesh, 'FairyLights')) {
        // not lightmapped: the bulbs glow on their own, the thin wire keeps its plain material
        const src = mesh.material as MeshStandardMaterial
        if (src.name === 'M_FairyBulb') mesh.material = fairyBulb
        return
      }
      const owner = ownerName(mesh)
      if (owner) {
        const atlas = LM.objects[owner]!
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => baked(m, atlas))
        else mesh.material = baked(mesh.material, atlas)
        if (owner === 'Poster') {
          const pm = (mesh.material as MeshStandardMaterial).clone()
          pm.map = canvasTexture(print.poster(posterPhoto.image as HTMLImageElement))
          pm.color.setRGB(1, 1, 1)
          pm.roughness = 0.75
          mesh.material = pm
        }
        // static geometry still casts into the lamp's shadow map so moving objects get shadowed
        mesh.castShadow = !/^(Floor|Ceiling|Wall_|Curtain|Wardrobe|Skirting)/.test(owner)
      } else if (!name.startsWith('Stack')) {
        console.warn('[room] no lightmap for', name)
      }
    })
    // boxes for hotspots / focus rings
    for (const n of ['Notepad', 'TV_Shell', 'Computer_Shell', 'CDPlayer', 'Resume', 'VCR_Shell', 'Lamp']) {
      const o = registry.get(n)
      if (o) o.userData.box = new Box3().setFromObject(o)
    }
    const tape = registry.get('Tape')
    if (tape) tape.visible = false
    useStore.getState().set({ sceneReady: true })
  }, [gltf, lmList, city]) // eslint-disable-line react-hooks/exhaustive-deps

  return <primitive object={gltf.scene} />
}

const MODEL_URL = '/models/room.glb'
useLoader.preload(GLTFLoader, MODEL_URL, (l) => l.setMeshoptDecoder(MeshoptDecoder))
