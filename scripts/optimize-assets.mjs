// Optimises the Blender exports for the web.
//   assets-src/generated/room_raw.glb      -> public/models/room.glb (WebP textures, meshopt geometry)
//   assets-src/generated/nitho_raw.glb     -> public/models/nitho.glb (the seated character, skinned)
//   assets-src/generated/lightmaps/*.png   -> public/models/lm_*.webp (+ updates src/scene/lightmaps.json)
//   assets-src/generated/city.png          -> public/textures/city.webp + city_sm.webp
// Usage: npm run assets:optimize
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, textureCompress, meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const gen = join(root, 'assets-src', 'generated')
const pub = join(root, 'public')
await mkdir(join(pub, 'models'), { recursive: true })
await mkdir(join(pub, 'textures'), { recursive: true })
const kb = async (p) => `${Math.round((await stat(p)).size / 1024)} KB`

// ---------------------------------------------------------------- GLB
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(join(gen, 'room_raw.glb'))
await doc.transform(
  dedup(),
  // keepAttributes: lightmap UVs (TEXCOORD_1) are not referenced by any glTF material
  // keepLeaves: helper empties (stack bases, slot mouth, lamp light) are read by the app
  prune({ keepAttributes: true, keepLeaves: true, keepExtras: true }),
  // the desk top is seen close-up in the Work view: keep its wood at 2K
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /teak_veneer_Diffuse/, resize: [2048, 2048], quality: 84 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14, quantizeTexcoord: 14, quantizeNormal: 10 }),
)
const glbOut = join(pub, 'models', 'room.glb')
await io.write(glbOut, doc)
console.log('room.glb', await kb(glbOut))

// ---------------------------------------------------------------- the seated character (blender/pose_character.py)
const charRaw = join(gen, 'nitho_raw.glb')
if (await stat(charRaw).catch(() => null)) {
  const cdoc = await io.read(charRaw)
  await cdoc.transform(
    dedup(),
    prune({ keepAttributes: true, keepExtras: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14, quantizeTexcoord: 12, quantizeNormal: 10 }),
  )
  const charOut = join(pub, 'models', 'nitho.glb')
  await io.write(charOut, cdoc)
  console.log('nitho.glb', await kb(charOut))
}

// ---------------------------------------------------------------- lightmaps
const lmDir = join(gen, 'lightmaps')
const manifestPath = join(root, 'src', 'scene', 'lightmaps.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
for (const f of (await readdir(lmDir)).filter((f) => f.endsWith('.png'))) {
  const name = f.replace(/\.png$/, '')
  const out = join(pub, 'models', `${name}.webp`)
  await sharp(join(lmDir, f)).webp({ quality: 92, smartSubsample: true }).toFile(out)
  const atlas = name.replace(/^lm_/, '')
  if (manifest.atlases[atlas]) manifest.atlases[atlas].file = `models/${name}.webp`
  console.log(`${name}.webp`, await kb(out))
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 1))

// ---------------------------------------------------------------- city panorama
const city = join(gen, 'city.png')
await sharp(city).webp({ quality: 86 }).toFile(join(pub, 'textures', 'city.webp'))
await sharp(city).resize(2048).webp({ quality: 84 }).toFile(join(pub, 'textures', 'city_sm.webp'))
console.log('city.webp', await kb(join(pub, 'textures', 'city.webp')), 'city_sm.webp', await kb(join(pub, 'textures', 'city_sm.webp')))
