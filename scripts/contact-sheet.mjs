// Tiles screenshots into one image for quick review.
// node scripts/contact-sheet.mjs <out.jpg> <cols> <tileWidth> <files...>
import sharp from 'sharp'

const [out, colsArg, twArg, ...files] = process.argv.slice(2)
const cols = +colsArg
const tw = +twArg
const metas = await Promise.all(files.map((f) => sharp(f).metadata()))
const th = Math.round((tw * metas[0].height) / metas[0].width)
const rows = Math.ceil(files.length / cols)
const tiles = await Promise.all(files.map((f) => sharp(f).resize(tw, th, { fit: 'cover' }).toBuffer()))
await sharp({ create: { width: cols * tw + (cols - 1) * 6, height: rows * th + (rows - 1) * 6, channels: 3, background: '#ffffff' } })
  .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * (tw + 6), top: Math.floor(i / cols) * (th + 6) })))
  .jpeg({ quality: 86 })
  .toFile(out)
console.log('wrote', out)
