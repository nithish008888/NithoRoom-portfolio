import { MeshStandardMaterial, ShaderChunk, type Texture, type Vector4 } from 'three'
import { layerWeights } from '../lighting'

/**
 * Turns a glTF PBR material into a "baked" material:
 *  - diffuse light comes from the Cycles lightmaps (TEXCOORD_1) only: four light layers (base, window,
 *    lamp, tube) summed with the shared weights in ../lighting.ts, so lights can be switched at runtime,
 *  - realtime point/spot/sun/directional/hemisphere lights are skipped (they
 *    light the moving objects; on baked surfaces they would double the light),
 *  - rect-area lights still apply (the CRT's glow is live so the screen can
 *    change colour),
 *  - the environment map contributes specular reflections but no diffuse
 *    irradiance (that is already in the lightmap).
 * three.js substitutes NUM_*_LIGHTS textually, so we edit the chunk source.
 */
function strip(src: string, pairs: [string, string][], label: string) {
  let out = src
  for (const [a, b] of pairs) {
    if (!out.includes(a)) console.warn(`[room] baked patch: "${a}" not found in ${label}`)
    out = out.split(a).join(b)
  }
  return out
}

const BEGIN = strip(
  ShaderChunk.lights_fragment_begin,
  [
    ['#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0'],
    ['#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0'],
    ['#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0'],
    ['#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0'],
    ['#if ( NUM_HEMI_LIGHTS > 0 )', '#if 0'],
    ['vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', 'vec3 irradiance = vec3( 0.0 );'],
  ],
  'lights_fragment_begin',
)

const MAPS = strip(
  ShaderChunk.lights_fragment_maps,
  [
    ['iblIrradiance += getIBLIrradiance( geometryNormal );', ''],
    [
      'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;',
      `vec3 lightMapIrradiance = lightMapTexel.rgb * lmScale.x * lmWeight.x
        + texture2D( lmWindow, vLightMapUv ).rgb * ( lmScale.y * lmWeight.y )
        + texture2D( lmLamp, vLightMapUv ).rgb * ( lmScale.z * lmWeight.z );
      if ( lmWeight.w > 0.0 ) lightMapIrradiance += texture2D( lmTube, vLightMapUv ).rgb * ( lmScale.w * lmWeight.w );`,
    ],
  ],
  'lights_fragment_maps',
)

const PARS = /* glsl */ `
#include <lightmap_pars_fragment>
uniform sampler2D lmWindow;
uniform sampler2D lmLamp;
uniform sampler2D lmTube;
uniform vec4 lmScale;
uniform vec4 lmWeight;
`

/** Shared clock for the swaying cloth and leaves (advanced by <Systems/>). */
export const swayTime = { value: 0 }

/**
 * A slow sway in world space (the lightmap stays put; the motion is millimetres).
 * curtain: hangs from `top`, the hem moves most, towards and away from the window.
 * plant: grows from `base`, the leaf tips move most, sideways.
 */
export type Sway = { kind: 'curtain' | 'plant'; from: number; length: number; amp: number }

const SWAY = {
  curtain: /* glsl */ `
    float swH = clamp( ( uSway.x - swW.y ) / uSway.y, 0.0, 1.0 );
    float swP = swW.x * 2.3 + swW.y * 0.9;
    float swS = sin( swayT * 0.75 + swP ) * 0.65 + sin( swayT * 1.63 + swP * 1.7 + 1.3 ) * 0.35;
    vec3 swD = vec3( 0.12 * swS, 0.0, swS ) * uSway.z * swH * swH;`,
  plant: /* glsl */ `
    float swH = clamp( ( swW.y - uSway.x ) / uSway.y, 0.0, 1.0 );
    float swP = swW.x * 31.0 + swW.z * 23.0;
    vec3 swD = vec3( sin( swayT * 1.1 + swP ), 0.0, sin( swayT * 0.83 + swP * 1.3 + 2.0 ) ) * uSway.z * swH * swH;`,
}

export type LayerMaps = { base: Texture; window: Texture; lamp: Texture; tube: Texture }

/** `scales` = PI * the manifest scale of each layer (base, window, lamp, tube). */
export function makeBaked(src: MeshStandardMaterial, maps: LayerMaps, scales: Vector4, sway?: Sway): MeshStandardMaterial {
  const m = src.clone() as MeshStandardMaterial
  m.lightMap = maps.base
  m.lightMapIntensity = scales.x
  m.onBeforeCompile = (shader) => {
    shader.uniforms.lmWindow = { value: maps.window }
    shader.uniforms.lmLamp = { value: maps.lamp }
    shader.uniforms.lmTube = { value: maps.tube }
    shader.uniforms.lmScale = { value: scales }
    shader.uniforms.lmWeight = layerWeights
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lightmap_pars_fragment>', PARS)
      .replace('#include <lights_fragment_begin>', BEGIN)
      .replace('#include <lights_fragment_maps>', MAPS)
    if (sway) {
      shader.uniforms.swayT = swayTime
      shader.uniforms.uSway = { value: [sway.from, sway.length, sway.amp] }
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float swayT;\nuniform vec3 uSway;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 swW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          ${SWAY[sway.kind]}
          // world -> object: transpose / scale² inverts rotation and uniform scale (the plant is scaled)
          transformed += swD * mat3( modelMatrix ) / dot( modelMatrix[ 0 ].xyz, modelMatrix[ 0 ].xyz );
        }`,
      )
    }
  }
  m.customProgramCacheKey = () => (sway ? `baked-${sway.kind}` : 'baked')
  m.userData.baked = true
  return m
}
