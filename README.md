# Nithishhariharan M — the night desk

**Live:** https://nithoroom-portfolio.vercel.app

An interactive 3D portfolio: a wooden desk in front of a rainy night window in a
fifth-floor room in Thanjavur, looking out at the floodlit Big Temple, gopurams,
the palace domes and Tamil neon shop signs. Pick a tape from the stacks and it
slides into the VCR, the television tracks through static and plays the
project's footage; the legal pad holds the work list, the old computer (where
Nithish's own character sits typing) tells the story, the printout is the
résumé, the index card has the contact links, and the Discman plays music
through the two desk speakers. His photo is the "ME" poster on the wall.

Built with **Three.js + React Three Fiber + TypeScript** (Vite). Room and props
are modelled in **Blender** (scripted, `blender/`), lit with baked **Cycles**
lightmaps, plus CC0 props from **Poly Haven**.

---

## Run it

```bash
npm install
npm run dev          # http://127.0.0.1:4810  (fixed port, fails loudly if taken)
```

| command | what it does |
| --- | --- |
| `npm run dev` | dev server on **port 4810** |
| `npm run build` | type-check + production build into `dist/` |
| `npm run preview` | serve the production build on **port 4811** |
| `npm run typecheck` | TypeScript only |
| `npm run assets:optimize` | re-compress the Blender exports for the web |
| `npm run shots` | desktop + mobile screenshots into `docs/screenshots/` |
| `npm run demo` | renders the interaction video frame by frame into `docs/demo/demo.mp4` (needs ffmpeg) |
| `npm run demo:live` | quick real-time recording, `docs/demo/demo-live.webm` (no ffmpeg) |

Ports 4810/4811 were chosen to avoid the usual 3000/5173/8080. Change them in
`vite.config.ts` (`DEV_PORT`, `PREVIEW_PORT`).

Useful URLs

- `/#/work/escrochain` — deep link straight to a tape (works after entering)
- `/#/about`, `/#/resume`, `/#/contact`, `/#/music`, `/#/tv`
- `/?reading` — the simple reading version (also used when WebGL 2 is missing)
- `/?quality=low` / `?quality=high` — force the light or full renderer

## Edit the content

Everything visible comes from **`src/content/site.ts`** — bio, projects,
technologies, media, résumé file, contact links, music. Tape labels, the
notepad, the terminal, the résumé printout, the contact card, the TV programmes
and the reading version are all generated from it.

- **Project media**: put files in `public/media/<project-id>/` and list them in
  the project's `media` array (`{ type: 'video', src, poster? }` or
  `{ type: 'image', src, caption }`). On the CRT each tape opens with a title
  card, then each video plays once through and each still stays up for 6 s
  (a single video loops). Videos are muted unless sound is on, stay quiet while
  the speakers play music, stop when the tape is ejected and start over on the
  next play. `node scripts/encode-media.mjs` turns the supplied recordings in
  `assets-src/` into web files: cropped to the app view (no editor panels,
  browser tabs or taskbar), trimmed, H.264 with fast start, plus poster frames
  and the presentation screenshots.
- **Placeholders**: entries marked `placeholder: true` / `placeholderFields`
  show a visible "placeholder" marker in the room and the reading version.
- **Résumé**: `public/resume/Nithishhariharan-M-Resume.pdf` (copied from the PDF
  you supplied).
- **Music**: tracks in `site.music.tracks` (`src` in `public/audio/`) stream
  through the desk speakers. A click on the Discman starts the music (and turns
  sound on); a click on either speaker plays / pauses. The published site uses
  loops generated in the browser; add only music you have the rights to publish.
- **Poster**: `site.decor.poster.photo` (`public/images/me.jpg`) with "ME".

## How it is made

```
blender/build_scene.py      room, window, curtains, desk, CRT, VCR, tapes, notepad, lamp, mug,
                            CD player, speakers, headphones, old computer, chair, fairy lights…
                            + Poly Haven props
blender/pose_character.py   seats the owner's character (assets-src/nitho_articulation_v2.glb)
                            on the chair at the computer (pose in blender/nitho_pose.json)
blender/build_city.py       rainy Thanjavur: Big Temple vimana, gopurams, palace, lodge, shop rows,
                            palms, autos (rendered once as a panorama)
blender/finish_city.py      HDR -> 8-bit (Reinhard) + rain haze glow
blender/bake_export.py      joins props, lightmap UVs, Cycles bake (the character casts shadows), GLB
scripts/fetch-polyhaven.mjs downloads the CC0 source assets
scripts/make-signs.mjs      Tamil / English neon sign textures for the city (browser text shaping)
scripts/encode-media.mjs    project footage and stills for the web
scripts/optimize-assets.mjs WebP textures, meshopt geometry, WebP lightmaps, the character
```

Rebuild everything (Blender 5.2, GPU recommended):

```bash
node scripts/fetch-polyhaven.mjs
blender -b --factory-startup -P blender/build_scene.py
blender -b assets-src/blend/room.blend -P blender/pose_character.py
blender -b assets-src/blend/room.blend -P blender/bake_export.py -- 512
node scripts/make-signs.mjs
blender -b --factory-startup -P blender/build_city.py -- 128 4096
blender -b --factory-startup -P blender/finish_city.py -- 1.4
node scripts/encode-media.mjs
npm run assets:optimize
```

Runtime highlights

- Static surfaces use the baked Cycles lightmaps (diffuse) + a captured room
  cubemap (reflections); realtime lights only touch moving objects
  (`src/scene/materials/baked.ts`).
- The window glass samples the city panorama through a proxy sphere for
  parallax, refracts it through droplets and reflects the room
  (`src/scene/materials/windowGlass.ts`).
- Screens (TV, terminal, VCR display, notepad, labels, the poster) are canvases
  drawn from the content file; the TV plays the project footage through them.
- The music comes out of the speakers: each channel is a positional (HRTF)
  WebAudio source on its woofer and the listener rides on the camera, so the
  sound moves with the view; the cones pump with the low end and the LEDs glow
  (`src/audio/speakers.ts`, `src/scene/Speakers.tsx`).
- The seated character is skinned (blinks, breathes) and lit by a light probe
  captured in its corner, so it sits in the baked room (`src/scene/Avatar.tsx`).
  It loads after the room, so it never delays entry.
- Every in-world surface you can read or press has a real HTML twin glued onto
  it with a CSS `matrix3d` homography — keyboard focus, screen readers and links
  work (`src/scene/anchors.ts`, `src/ui/*Overlay.tsx`).
- Camera moves and the tape/notepad animations are interruptible (velocity
  preserving), so rapid clicks never snap (`src/lib/anim.ts`,
  `src/scene/Tapes.tsx`).

## Accessibility & fallbacks

- Header navigation, Esc / "Back to the desk", browser Back and deep links.
- Keyboard: W work · A about · R résumé · C contact · M music · T tv · Esc back;
  Tab reaches every in-world control (focus rings are drawn on the objects).
- `prefers-reduced-motion`: camera cuts with a short fade, no rain animation,
  tapes go straight into the deck.
- No WebGL 2 → the reading version. `?reading` any time.
- Sound is off unless the visitor chooses "enter with sound".

## Screenshots & demo

- `docs/screenshots/desktop-01…11-*.png` (1920×1080; reading version 1440×900)
  and `mobile-01…11-*.png` (390×844 @2x, touch): entry, overview, notepad, tape
  loading, tape playing, about terminal, résumé, contact, music, TV, reading
  version.
- `docs/demo/demo.mp4` (H.264) / `demo.webm` at 1280×720: loading → entry →
  notepad → one tape from the stack, one from the notepad list (with their
  footage) → about (the character at the computer) → résumé → contact → the
  Discman starting the music → back to the desk.

## Checks

The scripts drive the installed **Google Chrome** through Playwright
(`channel: 'chrome'`, ANGLE/D3D11 flags for Windows GPUs; adjust `args` on other
systems). Start `npm run dev` (or `npm run build && npm run preview`, then pass
`http://127.0.0.1:4811/`) and in another terminal:

```bash
node scripts/stress.mjs                  # hammer tapes/views, verify the final state is consistent
npm run shots                            # docs/screenshots/{desktop,mobile}-*.png
npm run demo -- --webm                   # docs/demo/demo.mp4 (+ demo.webm)
node scripts/check-feedback.mjs fb       # fb_hover.png + fb_focus.png: tooltip and keyboard focus ring
node scripts/make-still.mjs              # public/images/still.jpg + card.jpg (fallback + social card)
node scripts/dev-shot.mjs <url> <prefix> 1600 900 ready enter wait:3000 shot:a   # ad-hoc shots
```

`npm run demo` drives the page on Playwright's fake clock and screenshots every frame,
so the video stays smooth even when the GPU is busy with something else. It
pipes the frames to ffmpeg (not a project dependency): put `ffmpeg` on `PATH`
or set `FFMPEG=/path/to/ffmpeg`. CSS transitions still run on the real clock,
so fades look a little quicker in the video than in the browser.

## Known gaps

- Sound was only exercised in headless Chrome, so nothing was heard: the
  speaker positioning (HRTF), the music level and the footage audio need one
  listen with headphones and with speakers.
- Tested in desktop Chrome and Chrome's mobile emulation only (no real phone,
  Safari or Firefox yet). The seated character adds ~100k skinned triangles;
  check frame rate on a mid-range phone.
- The slow-frame guard, WebGL context loss and no-WebGL fallback were tested by
  simulation (busy main thread, `WEBGL_lose_context`, `--disable-webgl`), not
  on weak hardware.

## Content status

| item | status |
| --- | --- |
| Name, location, summary, interests, skills, education | from the supplied résumé PDF |
| Hemodialysis VR Training Simulator, EscroChain | text/tech/GitHub from the résumé; footage from the supplied recordings |
| CKD screening and VR integration | from the project presentation (summary, own modules, results, team); footage + presentation screenshots |
| Project periods | CKD: 2026 (presentation timeline); the others are not stated anywhere → left empty |
| Contact | email + GitHub from the résumé; phone hidden (`site.contact.phone.show`); LinkedIn not supplied |
| CD player music | loops generated in the browser (the supplied commercial song is kept out of the public site) |
| Poster, character | the owner's photo and 3D character, supplied for this site |

## Credits

- Props (CC0, Poly Haven): Potted Plant 02, Round Spectacles, Stationery
  Supplies, Office Notepads, Binder Notebook, Portable Cassette Player,
  Encyclopedia Book Set 01, Postcard Set 01.
- Textures (CC0, Poly Haven): Teak Veneer, Beige Wall 001, Terlenka, Dark
  Wood, Terracotta Floor Tiles.
- Fonts (OFL, via Fontsource): Archivo, Caveat, VT323, Courier Prime,
  Catamaran (also the Tamil neon signs in the city).
- The owner's own material: photo (poster), 3D character "Nitho", project
  recordings and presentation, music file.
- Design reference: felixrieseberg.com (layout and interaction ideas; all
  models, textures and code here are original or CC0).
