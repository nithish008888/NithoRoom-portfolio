// Side-by-side comparison image: reference frame (left) vs our screenshot (right).
// node scripts/compare.mjs <reference.png|jpg|webp> <ours.png> <out.jpg>
import sharp from 'sharp'

const [ref, ours, out] = process.argv.slice(2)
const W = 960
const H = 540
const a = await sharp(ref).resize(W, H, { fit: 'cover' }).toBuffer()
const b = await sharp(ours).resize(W, H, { fit: 'cover' }).toBuffer()
const label = (t) =>
  Buffer.from(`<svg width="${W}" height="40"><rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/><text x="14" y="27" font-family="monospace" font-size="20" fill="#fff">${t}</text></svg>`)
await sharp({ create: { width: W * 2 + 8, height: H, channels: 3, background: '#ffffff' } })
  .composite([
    { input: a, left: 0, top: 0 },
    { input: b, left: W + 8, top: 0 },
    { input: label('reference'), left: 0, top: H - 40 },
    { input: label('this build'), left: W + 8, top: H - 40 },
  ])
  .jpeg({ quality: 88 })
  .toFile(out)
console.log('wrote', out)
