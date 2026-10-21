import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import {
  CubeCamera,
  HalfFloatType,
  LoadingManager,
  PMREMGenerator,
  Quaternion,
  Vector3,
  WebGLCubeRenderTarget,
  type Bone,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type SkinnedMesh,
  type Texture,
} from 'three'
import { layerWeights, levels } from './lighting'

/** Light probe beside the avatar's head: it is lit by the corner it sits in (baked walls, lamp spill, screen). */
const PROBE = new Vector3(-0.78, 1.18, 1.18)
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)

/**
 * The owner's character, seated at the old computer (posed in blender/pose_character.py). Blinks, breathes
 * and drifts a little; lit by a local probe so it sits in the baked room instead of floating on top of it.
 */
export function Avatar() {
  const gltf = useLoader(GLTFLoader, '/models/nitho.glb', (l) => {
    l.setMeshoptDecoder(MeshoptDecoder)
    l.manager = new LoadingManager() // keep the boot progress bar out of it
  })
  const { gl, scene } = useThree()
  const env = useRef<Texture | null>(null)
  const frames = useRef(0)

  const rig = useMemo(() => {
    const lids: { mesh: Mesh; idx: number }[] = []
    const mats: MeshStandardMaterial[] = []
    const bones: Record<string, Bone> = {}
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => {
      const m = o as SkinnedMesh
      if (m.isMesh) {
        m.castShadow = false
        m.receiveShadow = false
        if (m.isSkinnedMesh) {
          m.skeleton.update()
          m.computeBoundingSphere() // posed bounds, so frustum culling stays on
          if (m.boundingSphere) m.boundingSphere.radius *= 1.15
        }
        const dict = m.morphTargetDictionary
        if (dict) for (const [k, idx] of Object.entries(dict)) if (k.startsWith('Blink')) lids.push({ mesh: m, idx })
        for (const mat of ([] as Material[]).concat(m.material)) if ((mat as MeshStandardMaterial).isMeshStandardMaterial) mats.push(mat as MeshStandardMaterial)
      }
      if ((o as Bone).isBone) bones[o.name] = o as Bone
    })
    const rest = (b?: Bone) => (b ? b.quaternion.clone() : new Quaternion())
    return {
      lids,
      mats,
      chest: bones.Chest,
      spine: bones.Spine,
      head: bones.Head,
      rest: { chest: rest(bones.Chest), spine: rest(bones.Spine), head: rest(bones.Head) },
      blinkAt: 1.5,
    }
  }, [gltf])

  useEffect(
    () => () => {
      env.current?.dispose()
    },
    [],
  )

  const q = useMemo(() => new Quaternion(), [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    // one-off light probe once the room has drawn a few frames (the avatar itself hidden)
    if (!env.current && ++frames.current === 6) {
      const rt = new WebGLCubeRenderTarget(128, { type: HalfFloatType })
      const cam = new CubeCamera(0.05, 30, rt)
      cam.position.copy(PROBE)
      gltf.scene.visible = false
      // always in the default light (lamp on, tube off): the intensity below follows the switches
      const w = layerWeights.value.clone()
      layerWeights.value.set(1, 1, 1, 0)
      cam.update(gl, scene)
      layerWeights.value.copy(w)
      gltf.scene.visible = true
      const pm = new PMREMGenerator(gl)
      env.current = pm.fromCubemap(rt.texture).texture
      pm.dispose()
      rt.dispose()
      for (const m of rig.mats) {
        m.envMap = env.current
        m.needsUpdate = true
      }
    }
    // the probe was captured with the lamp on and the tube off: follow the switches roughly
    // (the realtime lamp spot and tube light add the direct part)
    const probe = 1.15 * (0.8 + 0.2 * levels.lamp) * (1 + 0.6 * levels.tube)
    for (const m of rig.mats) m.envMapIntensity = probe
    // breathing (~14 a minute), a slow drift of the head, blinks every few seconds
    const br = Math.sin(t * 1.47)
    if (rig.chest) rig.chest.quaternion.copy(rig.rest.chest).multiply(q.setFromAxisAngle(X, br * 0.012))
    if (rig.spine) rig.spine.quaternion.copy(rig.rest.spine).multiply(q.setFromAxisAngle(X, br * 0.006))
    if (rig.head) {
      rig.head.quaternion
        .copy(rig.rest.head)
        .multiply(q.setFromAxisAngle(Y, Math.sin(t * 0.31) * 0.03 + Math.sin(t * 0.83) * 0.01))
        .multiply(q.setFromAxisAngle(X, Math.sin(t * 0.21 + 1.3) * 0.018))
    }
    const since = t - rig.blinkAt
    const w = since > 0 && since < 0.17 ? Math.sin((since / 0.17) * Math.PI) : 0
    for (const l of rig.lids) if (l.mesh.morphTargetInfluences) l.mesh.morphTargetInfluences[l.idx] = w
    if (since >= 0.17) rig.blinkAt = t + 2.2 + Math.random() * 4.5
  })

  return <primitive object={gltf.scene} />
}
