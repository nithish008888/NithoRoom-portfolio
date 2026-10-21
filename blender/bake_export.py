"""Join props, generate lightmap UVs, bake irradiance lightmaps (Cycles, GPU) and export the GLB.

blender -b assets-src/blend/room.blend --python-exit-code 1 -P blender/bake_export.py -- [samples] [--no-bake]

Outputs
  assets-src/generated/room_raw.glb                        (optimised later by scripts/optimize-assets.mjs)
  assets-src/generated/lightmaps/lm_<layer>_<atlas>.png    (8-bit sRGB, value = irradiance / scale)
  src/scene/lightmaps.json   ({layers, atlases: {atlas: {maps: {layer: {file, scale, size}}}}, objects -> atlas)

Every light layer (see LAYERS) is baked on its own, so the web app can switch and dim lights by summing the
layers with its own weights. Lightmaps store diffuse light only (no albedo). In three.js the contribution of
a layer is texel * PI * scale.
"""
import bpy
import bmesh
import json
import math
import os
import sys
import struct
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import lib  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SAMPLES = int(argv[0]) if argv and argv[0].isdigit() else 512
DO_BAKE = '--no-bake' not in argv
R = math.radians
scene = bpy.context.scene
GEN = lib.GEN
os.makedirs(os.path.join(GEN, 'lightmaps'), exist_ok=True)
os.makedirs(os.path.join(lib.ROOT, 'public', 'models'), exist_ok=True)


def colobjs(name):
    c = bpy.data.collections.get(name)
    return list(c.all_objects) if c else []


# ----------------------------------------------------------------------------- 1. join props into single meshes
def join_children(empty_name, new_name, coll='STATIC'):
    e = bpy.data.objects.get(empty_name)
    if not e:
        return None
    kids = [k for k in e.children_recursive if k.type == 'MESH' and coll in [c.name for c in k.users_collection]]
    if not kids:
        return None
    o = lib.join(kids, new_name + '__tmp')
    if not e.children:          # nothing left under the group empty: the joined mesh takes its place
        bpy.data.objects.remove(e)
    o.name = new_name
    o.data.name = new_name
    return o


def join_named(names, new_name):
    objs = [bpy.data.objects[n] for n in names if n in bpy.data.objects]
    if not objs:
        return None
    return lib.join(objs, new_name)


def join_prefix(prefix, new_name, coll='STATIC'):
    objs = [o for o in colobjs(coll) if o.type == 'MESH' and o.name.startswith(prefix)]
    if not objs:
        return None
    return lib.join(objs, new_name)


bpy.context.view_layer.update()
for g, n in [('TV', 'TV_Shell'), ('VCR', 'VCR_Shell'), ('Lamp', 'Lamp'), ('Remote', 'Remote'),
             ('Calculator', 'Calculator'), ('Floppy0', 'Floppy0'), ('Floppy1', 'Floppy1'), ('CDPlayer', 'CDPlayer'),
             ('Headphones', 'Headphones'), ('Computer', 'Computer_Shell'), ('Keyboard', 'Keyboard'),
             ('SwitchBoard', 'SwitchBoard'), ('Window_Handle', 'Window_Handle'), ('Speaker_L', 'Speaker_L'),
             ('Speaker_R', 'Speaker_R'), ('Chair', 'Chair')]:
    join_children(g, n)
join_prefix('Curtain_Ring_', 'Curtain_Rings')
join_named(['Curtain_Rod'] + [o.name for o in colobjs('STATIC') if o.name.startswith(('Rod_Finial', 'Rod_Bracket'))],
           'Curtain_RodSet')
join_named(['Desk_Drawer', 'Drawer_Knob0', 'Drawer_Knob1'], 'Desk_Drawer')
join_named(['Mug', 'Mug_Handle', 'Mug_Coffee'], 'Mug')
join_named(['Wardrobe', 'Wardrobe_Handle0', 'Wardrobe_Handle1'], 'Wardrobe')
join_prefix('Postcard_', 'Postcards')
join_prefix('Poster_Tape', 'Poster_Tapes')
join_prefix('Stationery_', 'PenCup')
join_prefix('Book_', 'Books')
join_prefix('Walkman_', 'Walkman')
join_prefix('Plant_', 'Plant')
join_prefix('Fairy_', 'FairyLights')
join_named(['HP_Cable', 'KB_Cable', 'Lamp_Cable', 'Spk_Cable', 'Spk_Cable2'], 'Cables')
join_prefix('Skirting_', 'Skirting')

# the seated character (blender/pose_character.py) only throws its shadow and bounce into the bake;
# it is exported on its own (public/models/nitho.glb) and lit at runtime
CHAR_BLEND = os.path.join(lib.ROOT, 'assets-src', 'blend', 'nitho_posed.blend')
if os.path.exists(CHAR_BLEND):
    occ = bpy.data.collections.new('OCCLUDERS')
    scene.collection.children.link(occ)
    with bpy.data.libraries.load(CHAR_BLEND) as (src, dst):
        dst.objects = list(src.objects)
    for o in dst.objects:
        if o is not None:
            occ.objects.link(o)
    print('OCCLUDERS', [o.name for o in occ.objects])

# ----------------------------------------------------------------------------- 2. lightmap atlases
ATLAS_OF = {}
ROOM_SHELL = ['Floor', 'Ceiling', 'Wall_Left', 'Wall_Right', 'Wall_Back', 'Wall_Window', 'Skirting', 'Curtain_L',
              'Curtain_R', 'Curtain_Rings', 'Curtain_RodSet', 'Wardrobe', 'SideDesk_Top', 'SideDesk_Frame',
              'SwitchBoard', 'Postcards', 'Desk_Frame', 'Desk_Drawer', 'Poster_Tapes', 'Window_Sill', 'Window_Frame',
              'Window_Handle']
DESK = ['Desk_Top']   # the most-seen surface gets a whole atlas (crisp contact shadows)
static_meshes = [o for o in colobjs('STATIC') if o.type == 'MESH']
poster = bpy.data.objects.get('Poster')
if poster:
    static_meshes.append(poster)
# self-lit bits that would skew an atlas's exposure (they glow on their own at runtime)
NO_LIGHTMAP = ('FairyLights', 'Tube_Diffuser')
static_meshes = [o for o in static_meshes if o.name not in NO_LIGHTMAP]
for o in static_meshes:
    if o.name in ROOM_SHELL:
        ATLAS_OF[o.name] = 'room'
    elif o.name in DESK:
        ATLAS_OF[o.name] = 'desk'
    else:
        ATLAS_OF[o.name] = 'props'


def ensure_uvs(o):
    me = o.data
    if 'UVMap' not in me.uv_layers:
        if len(me.uv_layers):
            me.uv_layers[0].name = 'UVMap'
        else:
            me.uv_layers.new(name='UVMap')
            lib.uv_box(o, 4.0)
    if 'Lightmap' not in me.uv_layers:
        me.uv_layers.new(name='Lightmap')
    # keep UVMap first (TEXCOORD_0) and rendering, Lightmap second (TEXCOORD_1)
    me.uv_layers['UVMap'].active_render = True


def unwrap_atlas(name):
    objs = [bpy.data.objects[n] for n, a in ATLAS_OF.items() if a == name]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        ensure_uvs(o)
        o.data.uv_layers.active = o.data.uv_layers['Lightmap']
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=R(60), island_margin=0.0, area_weight=0.0, correct_aspect=True,
                             scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=0.0035)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['UVMap']
    return objs


atlas_objs = {}
for a in ('room', 'desk', 'props'):
    atlas_objs[a] = unwrap_atlas(a)
    print('ATLAS', a, len(atlas_objs[a]), 'objects')

# ----------------------------------------------------------------------------- 3. bake, one lightmap per light layer
#   base    room fill, the corner and fairy-light washes, the small LEDs
#   window  the night through the glass (and the sky); lightning flashes boost it at runtime
#   lamp    the desk lamp (bulb + glowing shade); a click on the lamp switches it
#   tube    the wall tube light; the switch above the computer turns it on (off by default)
# emit: emissive materials that belong to the layer (None = every emitter no other layer claims)
LAYERS = {
    'base': {'lights': ('L_Room', 'L_RoomLeft', 'L_Corner', 'L_Fairy'), 'emit': None, 'world': False,
             'size': {'room': 2048, 'desk': 2048, 'props': 2048}},
    'window': {'lights': ('L_Window',), 'emit': (), 'world': True, 'size': {'room': 1024, 'desk': 1024, 'props': 1024}},
    'lamp': {'lights': ('L_Lamp',), 'emit': ('M_Bulb', 'M_LampInner'), 'world': False,
             'size': {'room': 1024, 'desk': 2048, 'props': 2048}},
    'tube': {'lights': ('L_Tube',), 'emit': ('M_TubeLight',), 'world': False, 'size': {'room': 1024, 'desk': 1024, 'props': 1024}},
}
manifest = {'layers': list(LAYERS), 'atlases': {a: {'maps': {}} for a in atlas_objs}, 'objects': ATLAS_OF}


def write_png(path, arr):
    hh, ww, _ = arr.shape
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(hh))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', ww, hh, 8, 2, 0, 0, 0)) + \
        chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)


def box_blur(a, r):
    k = 2 * r + 1
    c = np.cumsum(np.pad(a, ((0, 0), (r + 1, r), (0, 0)), mode='edge'), axis=1)
    a = (c[:, k:] - c[:, :-k]) / k
    c = np.cumsum(np.pad(a, ((r + 1, r), (0, 0), (0, 0)), mode='edge'), axis=0)
    return (c[k:, :] - c[:-k, :]) / k


def finish_lightmap(img, name):
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    a = px.reshape(h, w, 4)
    rgb = a[:, :, :3]
    cov = a[:, :, 3:4]
    # light denoise: blur weighted by coverage so margins don't bleed dark texels
    num = box_blur(rgb * cov, 1)
    den = box_blur(cov, 1)
    rgb = np.where(den > 1e-4, num / np.maximum(den, 1e-4), rgb)
    rgb = rgb[::-1]   # Blender pixel rows are bottom-up
    scale = float(np.percentile(rgb[cov[::-1, :, 0] > 0.5], 99.7)) * 1.15 if (cov > 0.5).any() else 1.0
    scale = max(scale, 1e-3)
    v = np.clip(rgb / scale, 0, 1)
    s = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    write_png(os.path.join(GEN, 'lightmaps', f'lm_{name}.png'), (s * 255 + 0.5).astype(np.uint8))
    return scale


if DO_BAKE:
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'OPTIX'
    scene.cycles.device = 'GPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 4
    scene.cycles.sample_clamp_indirect = 3.0
    scene.cycles.sample_clamp_direct = 0.0
    scene.render.bake.margin = 6
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_clear = True
    # exclude things that move / are drawn by custom shaders
    for cname in ('PREVIEW', 'GLASS', 'EXTERIOR', 'DECALS'):
        for o in colobjs(cname):
            if o.name != 'Poster':
                o.hide_render = True
    for o in colobjs('DYNAMIC'):
        if not o.name.startswith('VCR_Door'):
            o.hide_render = True
    for o in colobjs('SCREENS'):
        for m in o.data.materials:
            b = m.node_tree.nodes.get('Principled BSDF')
            if b:
                b.inputs['Emission Strength'].default_value = 0.0
    for o in colobjs('HELPERS'):
        if o.type == 'MESH' and o.name.startswith('StackProxy'):
            o.visible_diffuse = True
            o.data.materials.clear()
            o.data.materials.append(lib.material('M_Proxy', color=(0.06, 0.06, 0.07), rough=0.5))

    # lights and emitters per layer
    lights = [o for o in scene.objects if o.type == 'LIGHT']
    claimed = {n for L in LAYERS.values() for n in L['lights']}
    for o in lights:
        if o.name not in claimed:
            print('WARNING light in no layer (never baked):', o.name)
    screen_mats = {m.name for o in colobjs('SCREENS') for m in o.data.materials if m}
    emitters = {}
    for m in bpy.data.materials:
        b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
        if b and m.name not in screen_mats and b.inputs['Emission Strength'].default_value > 0:
            emitters[m.name] = (b, b.inputs['Emission Strength'].default_value)
    owned = {n for L in LAYERS.values() if L['emit'] for n in L['emit']}
    bg = scene.world.node_tree.nodes.get('Background') if scene.world else None
    bg_strength = bg.inputs['Strength'].default_value if bg else 0.0
    for f in os.listdir(os.path.join(GEN, 'lightmaps')):   # results of earlier bakes
        if f.endswith(('.png', '.exr')):
            os.remove(os.path.join(GEN, 'lightmaps', f))

    for layer, L in LAYERS.items():
        for o in lights:
            o.hide_render = o.name not in L['lights']
        for name, (b, strength) in emitters.items():
            on = (name not in owned) if L['emit'] is None else (name in L['emit'])
            b.inputs['Emission Strength'].default_value = strength if on else 0.0
        if bg:
            bg.inputs['Strength'].default_value = bg_strength if L['world'] else 0.0
        print('LAYER', layer, 'lights', [o.name for o in lights if not o.hide_render],
              'emitters', [n for n, (b, _) in emitters.items() if b.inputs['Emission Strength'].default_value > 0])
        for a, objs in atlas_objs.items():
            w = h = L['size'][a]
            img = bpy.data.images.new(f'LM_{layer}_{a}', w, h, alpha=True, float_buffer=True)
            mats = {m for o in objs for m in o.data.materials if m}
            for m in mats:
                nt = m.node_tree
                n = nt.nodes.get('LM_TARGET') or nt.nodes.new('ShaderNodeTexImage')
                n.name = 'LM_TARGET'
                n.image = img
                nt.nodes.active = n
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            print('BAKING', layer, a, len(objs), 'objects', w, 'x', h, SAMPLES, 'spp')
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, uv_layer='Lightmap',
                                target='IMAGE_TEXTURES', use_clear=True, margin=6 if w >= 2048 else 4)
            scale = finish_lightmap(img, f'{layer}_{a}')
            manifest['atlases'][a]['maps'][layer] = {'file': f'models/lm_{layer}_{a}.png', 'scale': round(scale, 5),
                                                     'size': [w, h]}
            print('BAKED', layer, a, 'scale', scale)
            for m in mats:
                n = m.node_tree.nodes.get('LM_TARGET')
                if n:
                    m.node_tree.nodes.remove(n)
            bpy.data.images.remove(img)
    # restore lights, emitters and visibility for export
    for o in lights:
        o.hide_render = False
    for b, strength in emitters.values():
        b.inputs['Emission Strength'].default_value = strength
    if bg:
        bg.inputs['Strength'].default_value = bg_strength
    for cname in ('PREVIEW', 'GLASS', 'EXTERIOR', 'DECALS', 'DYNAMIC'):
        for o in colobjs(cname):
            o.hide_render = False
else:
    old = os.path.join(lib.ROOT, 'src', 'scene', 'lightmaps.json')
    if os.path.exists(old):
        prev = json.load(open(old))
        manifest['layers'] = prev.get('layers', manifest['layers'])
        manifest['atlases'] = prev['atlases']

json.dump(manifest, open(os.path.join(lib.ROOT, 'src', 'scene', 'lightmaps.json'), 'w'), indent=1)

# ----------------------------------------------------------------------------- 4. export GLB
bpy.ops.object.select_all(action='DESELECT')
export = []
for cname in ('STATIC', 'DYNAMIC', 'SCREENS', 'GLASS', 'DECALS', 'HELPERS'):
    for o in colobjs(cname):
        if o.type == 'MESH' and o.name.startswith('StackProxy'):
            continue
        if o.type in ('MESH', 'EMPTY'):
            export.append(o)
for o in export:
    o.hide_set(False)
    o.select_set(True)
out = os.path.join(GEN, 'room_raw.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_tangents=False,
                          export_materials='EXPORT', export_image_format='AUTO', export_extras=True,
                          export_yup=True, export_cameras=False, export_lights=False, export_animations=False)
print('EXPORTED', out, os.path.getsize(out) // 1024, 'KB', len(export), 'nodes')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(lib.ROOT, 'assets-src', 'blend', 'room_baked.blend'), compress=True)
