import { MeshStandardMaterial, ShaderChunk, type Texture } from 'three'

/**
 * Turns a glTF PBR material into a "baked" material:
 *  - diffuse light comes from the Cycles lightmap (TEXCOORD_1) only,
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

const MAPS = strip(ShaderChunk.lights_fragment_maps, [['iblIrradiance += getIBLIrradiance( geometryNormal );', '']], 'lights_fragment_maps')

export function makeBaked(src: MeshStandardMaterial, lightMap: Texture, intensity: number): MeshStandardMaterial {
  const m = src.clone() as MeshStandardMaterial
  m.lightMap = lightMap
  m.lightMapIntensity = intensity
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_fragment_begin>', BEGIN)
      .replace('#include <lights_fragment_maps>', MAPS)
  }
  m.customProgramCacheKey = () => 'baked'
  m.userData.baked = true
  return m
}
