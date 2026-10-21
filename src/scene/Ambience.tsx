import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import { useStore } from '../state/store'
import { levels } from './lighting'
import { registry } from './registry'

const HASH = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`

const WARM = new Color(1.0, 0.84, 0.66)
const COOL = new Color(0.86, 0.9, 1.0)
const TMP = new Color()

/** Steam curling up from the coffee: one camera-facing card with rising, twisting noise wisps. */
function makeSteam() {
  const geo = new PlaneGeometry(0.06, 0.17, 1, 12)
  geo.translate(0, 0.085, 0)
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color() }, uOpacity: { value: 0.26 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.x += sin(uv.y * 3.2 - uTime * 0.7) * 0.011 * uv.y + sin(uv.y * 7.0 - uTime * 1.3) * 0.003 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      ${HASH}
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 uv = vUv;
        vec2 p = vec2(uv.x * 2.4 + sin(uv.y * 4.0 - uTime * 0.8) * 0.3, uv.y * 1.7 - uTime * 0.3);
        float n = fbm(p * 2.3);
        float wisp = smoothstep(0.5, 0.82, n);
        float edge = pow(max(sin(3.14159 * uv.x), 0.0), 1.8);
        float fade = smoothstep(0.0, 0.14, uv.y) * pow(max(1.0 - uv.y, 0.0), 1.7);
        gl_FragColor = vec4(uColor, wisp * edge * fade * uOpacity);
      }
    `,
  })
  const mesh = new Mesh(geo, mat)
  mesh.name = 'Steam'
  mesh.renderOrder = 3
  return mesh
}

/** Dust drifting through the lamp's beam: points inside the light cone, glinting as they turn. */
function makeDust(count: number, apex: Vector3, aim: Vector3) {
  const axis = aim.clone().sub(apex).normalize()
  const u = new Vector3().crossVectors(axis, new Vector3(0, 1, 0)).normalize()
  const v = new Vector3().crossVectors(u, axis).normalize()
  const seeds = new Float32Array(count * 4)
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()
  const geo = new BufferGeometry()
  // positions are computed in the vertex shader; this attribute only sets the draw count and bounds
  geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('aSeed', new BufferAttribute(seeds, 4))
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uApex: { value: apex },
      uAxis: { value: axis },
      uU: { value: u },
      uV: { value: v },
      uLen: { value: 0.34 },
      uTan: { value: Math.tan(0.62) },
      uScale: { value: 1000 },
      uLevel: { value: 1 },
      uColor: { value: new Color(1.0, 0.83, 0.6) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec3 uApex;
      uniform vec3 uAxis;
      uniform vec3 uU;
      uniform vec3 uV;
      uniform float uLen;
      uniform float uTan;
      uniform float uScale;
      uniform float uLevel;
      varying float vA;
      void main() {
        float k = fract(aSeed.x + uTime * 0.006 * (0.4 + aSeed.w));   // slowly rising towards the warm bulb
        float s = mix(uLen, 0.07, k);
        float th = aSeed.y * 6.2832 + uTime * 0.05 * (aSeed.w - 0.5);
        float rr = sqrt(aSeed.z) * 0.92;
        vec3 p = uApex + uAxis * s + (uU * cos(th) + uV * sin(th)) * rr * s * uTan;
        p += vec3(sin(uTime * 0.31 + aSeed.w * 30.0), sin(uTime * 0.23 + aSeed.x * 20.0), sin(uTime * 0.27 + aSeed.y * 25.0)) * 0.008;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.2, 0.0028 * uScale / -mv.z);
        float ends = smoothstep(0.0, 0.12, k) * smoothstep(1.0, 0.85, k);
        float glint = 0.35 + 0.65 * pow(max(0.0, 0.5 + 0.5 * sin(uTime * (0.9 + 2.2 * aSeed.w) + aSeed.y * 50.0)), 3.0);
        // brightest close to the bulb, fading out towards the desk
        float near = 1.0 - smoothstep(0.08, uLen, s);
        vA = uLevel * ends * glint * (1.0 - rr * rr) * (0.15 + 0.85 * near * near) * 0.7;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  })
  const pts = new Points(geo, mat)
  pts.name = 'LampDust'
  pts.frustumCulled = false
  pts.renderOrder = 3
  return pts
}

/** Small signs of life on the desk: steam from the mug, dust turning in the lamp light. */
export function Ambience() {
  const sceneReady = useStore((s) => s.sceneReady)
  const lowPower = useStore((s) => s.lowPower)
  const { camera, size, gl } = useThree()

  const parts = useMemo(() => {
    const mug = registry.get('Mug')
    const lamp = registry.get('LampLight')
    const aim = registry.get('LampAim')
    let steam: Mesh | null = null
    if (mug) {
      const b = new Box3().setFromObject(mug)
      steam = makeSteam()
      steam.position.set((b.min.x + b.max.x) / 2 - 0.006, b.max.y - 0.014, (b.min.z + b.max.z) / 2)
    }
    const dust = lamp && aim ? makeDust(lowPower ? 30 : 64, lamp.getWorldPosition(new Vector3()), aim.getWorldPosition(new Vector3())) : null
    return { steam, dust }
  }, [sceneReady, lowPower]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const still = useStore.getState().reducedMotion
    const { steam, dust } = parts
    if (steam) {
      const m = steam.material as ShaderMaterial
      if (!still) m.uniforms.uTime!.value += dt
      // lit by whatever is on: the warm lamp, the cool tube, a faint room glow
      ;(m.uniforms.uColor!.value as Color).copy(WARM).multiplyScalar(0.1 + 0.62 * levels.lamp).add(TMP.copy(COOL).multiplyScalar(0.42 * levels.tube))
      steam.rotation.y = Math.atan2(camera.position.x - steam.position.x, camera.position.z - steam.position.z)
    }
    if (dust) {
      const m = dust.material as ShaderMaterial
      if (!still) m.uniforms.uTime!.value += dt
      m.uniforms.uLevel!.value = levels.lamp
      const fov = (camera as PerspectiveCamera).fov ?? 40
      m.uniforms.uScale!.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan(((fov * Math.PI) / 180) / 2))
      dust.visible = levels.lamp > 0.01
    }
  })

  return (
    <>
      {parts.steam && <primitive object={parts.steam} />}
      {parts.dust && <primitive object={parts.dust} />}
    </>
  )
}
