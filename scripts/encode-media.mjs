// Prepares the supplied project footage and stills for the web. Sources stay in assets-src/
// (not served); results go to public/media/<project-id>/.
//   videos: cropped to the app view (no editor chrome, taskbar or browser tabs), trimmed, H.264 + faststart
//   posters: one frame per video (reading version, and the CRT while a video buffers)
//   stills: screenshots from the project presentation, cropped to the game view
// node scripts/encode-media.mjs [--only <id>]   (ffmpeg on PATH, or FFMPEG=/path/to/ffmpeg)
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

/** crop = [w, h, x, y] in source pixels; trim = [start, end] seconds; poster = seconds into the output */
const VIDEOS = [
  // Unity editor recording (640x360): keep the Game view only. Audio kept (it has the simulator's sound).
  { id: 'hemodialysis-vr', src: 'assets-src/MachineDemo.mp4', out: 'demo.mp4', crop: [434, 242, 60, 38], audio: true, crf: 23, poster: 62 },
  // Unity editor recording (1280x720, no audio): Game view only.
  { id: 'ckd-screening-vr', src: 'assets-src/ckdfullvr.mp4', out: 'demo.mp4', crop: [886, 486, 98, 76], audio: false, crf: 27, poster: 40 },
  // Browser recording: below the tab bar (personal tabs), above the taskbar; skip the editor intro and the
  // recorder window at the end. The track is silent apart from a click, so no audio.
  { id: 'escrochain', src: 'assets-src/Escrow Protocol Blockchain.mkv', out: 'demo.mp4', crop: [1280, 576, 0, 44], trim: [15.5, 191.0], audio: false, crf: 28, poster: 33 },
]

/** Stills from the project presentation (Unity game-view captures share one layout). */
const GAME_VIEW = { left: 216, top: 4, width: 1114, height: 664 }
const STILLS = [
  { id: 'ckd-screening-vr', src: 'assets-src/stills/ckd-assessment.jpg', out: 'assessment.jpg', crop: GAME_VIEW },
  { id: 'ckd-screening-vr', src: 'assets-src/stills/ckd-high-risk.jpg', out: 'high-risk.jpg', crop: GAME_VIEW },
  { id: 'ckd-screening-vr', src: 'assets-src/stills/ckd-pipeline.jpg', out: 'pipeline.jpg' },
  { id: 'ckd-screening-vr', src: 'assets-src/stills/ckd-roc.jpg', out: 'roc.jpg' },
  { id: 'hemodialysis-vr', src: 'assets-src/stills/hemo-patient.jpg', out: 'patient.jpg', crop: GAME_VIEW },
  { id: 'hemodialysis-vr', src: 'assets-src/stills/hemo-priming.jpg', out: 'priming.jpg', crop: { ...GAME_VIEW, top: 32, height: 636 } },
]

function ffmpeg(args) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('error', (e) => rej(new Error(`could not start ffmpeg (${FFMPEG}): ${e.message}`)))
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`))))
  })
}

for (const v of VIDEOS) {
  if (only && v.id !== only) continue
  const dir = join(root, 'public', 'media', v.id)
  await mkdir(dir, { recursive: true })
  const [w, h, x, y] = v.crop
  const out = join(dir, v.out)
  const trim = v.trim ? ['-ss', String(v.trim[0]), '-to', String(v.trim[1])] : []
  const audio = v.audio ? ['-c:a', 'aac', '-b:a', '80k', '-ac', '2'] : ['-an']
  await ffmpeg([...trim, '-i', join(root, v.src), '-vf', `crop=${w}:${h}:${x}:${y},fps=30`, '-c:v', 'libx264', '-preset', 'slow',
    '-crf', String(v.crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ...audio, out])
  await ffmpeg(['-ss', String(v.poster), '-i', out, '-frames:v', '1', '-q:v', '3', join(dir, 'poster.jpg')])
  console.log('video', v.id, '->', out)
}

for (const s of STILLS) {
  if (only && s.id !== only) continue
  const dir = join(root, 'public', 'media', s.id)
  await mkdir(dir, { recursive: true })
  let img = sharp(join(root, s.src))
  if (s.crop) img = img.extract(s.crop)
  await img.resize({ width: 1280, height: 800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(join(dir, s.out))
  console.log('still', s.id, '->', s.out)
}
