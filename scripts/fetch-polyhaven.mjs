// Downloads the CC0 source assets used by the Blender build (models + PBR textures)
// from Poly Haven (https://polyhaven.com, all assets CC0) into assets-src/polyhaven.
// Usage: node scripts/fetch-polyhaven.mjs
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'assets-src', 'polyhaven')

// glTF models (1k textures keep the web build light; they get re-compressed later)
const MODELS = {
  potted_plant_02: '1k', // syngonium in a terracotta pot
  round_spectacles: '1k',
  stationery_supplies: '1k', // pen cup, pencils, eraser
  office_notepads: '1k', // sticky notes / note pads
  binder_notebook: '1k', // leather folio
  portable_cassette_player: '1k',
  book_encyclopedia_set_01: '1k',
  postcard_set_01: '1k',
}

// PBR texture sets: [resolution, maps]
const TEXTURES = {
  teak_veneer: ['2k', ['Diffuse', 'nor_gl', 'Rough']], // desk top (stained), window frame, side desk
  beige_wall_001: ['1k', ['Diffuse', 'nor_gl', 'Rough']],
  terlenka: ['1k', ['Diffuse', 'nor_gl', 'Rough']], // linen curtains
  dark_wood: ['1k', ['Diffuse', 'nor_gl', 'Rough']], // wardrobe
  terracotta_floor_tiles: ['1k', ['Diffuse', 'nor_gl', 'Rough']],
}

const exists = (p) => access(p).then(() => true, () => false)

async function fetchJson(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

async function download(url, dest) {
  if (await exists(dest)) return 'cached'
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, Buffer.from(await r.arrayBuffer()))
  return 'ok'
}

for (const [id, res] of Object.entries(MODELS)) {
  const files = await fetchJson(`https://api.polyhaven.com/files/${id}`)
  const g = files.gltf?.[res]?.gltf
  if (!g) throw new Error(`no gltf ${res} for ${id}`)
  const dir = join(out, 'models', id)
  console.log(id, await download(g.url, join(dir, `${id}.gltf`)))
  for (const [rel, f] of Object.entries(g.include ?? {})) await download(f.url, join(dir, rel))
}

for (const [id, [res, maps]] of Object.entries(TEXTURES)) {
  const files = await fetchJson(`https://api.polyhaven.com/files/${id}`)
  for (const m of maps) {
    const f = files[m]?.[res]?.jpg ?? files[m]?.[res]?.png
    if (!f) throw new Error(`missing ${m} ${res} for ${id}`)
    const ext = f.url.split('.').pop()
    console.log(id, m, await download(f.url, join(out, 'textures', id, `${id}_${m}_${res}.${ext}`)))
  }
}
console.log('done ->', out)
