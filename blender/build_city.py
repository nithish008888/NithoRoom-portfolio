"""Rainy night Thanjavur (Big Temple, gopurams, palace, Tamil neon) rendered as a partial equirectangular panorama
from the room's window. The web app samples it on the window glass with proxy-sphere parallax.

blender -b --factory-startup --python-exit-code 1 -P blender/build_city.py -- [samples] [width]
Needs the sign textures from scripts/make-signs.mjs. Writes assets-src/generated/city_pano.exr; finish_city.py
and npm run assets:optimize turn it into public/textures/city.webp.
"""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import lib  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SAMPLES = int(argv[0]) if argv else 256
WIDTH = int(argv[1]) if len(argv) > 1 else 4096
R = math.radians
rnd = lib.rng(2026)

lib.reset()
scene = bpy.context.scene
C = lib.coll('CITY')

STREET = -15.0         # street level relative to the room floor (room is on the 5th floor)
EYE = Vector((-0.06, 0.2, 1.45))   # window centre, just outside the glass
LON = (-80.0, 80.0)
LAT = (-58.0, 38.0)


# ----------------------------------------------------------------------------- materials
def emissive(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*color, 1)
    e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def facade_material(name, wall, lit_ratio, seed, cell=(3.2, 3.1), strength=6.0):
    """Building facade with a procedural window grid (world-space, works on any box face)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    n = nt.nodes
    L = nt.links
    n.clear()
    out = n.new('ShaderNodeOutputMaterial')
    bsdf = n.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*wall, 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    geo = n.new('ShaderNodeNewGeometry')
    sep_p = n.new('ShaderNodeSeparateXYZ')
    L.new(geo.outputs['Position'], sep_p.inputs[0])
    sep_n = n.new('ShaderNodeSeparateXYZ')
    L.new(geo.outputs['Normal'], sep_n.inputs[0])
    absn = n.new('ShaderNodeMath')
    absn.operation = 'ABSOLUTE'
    L.new(sep_n.outputs['Y'], absn.inputs[0])
    gt = n.new('ShaderNodeMath')
    gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 0.5
    L.new(absn.outputs[0], gt.inputs[0])
    # u = x on Y-facing faces, y otherwise
    mixu = n.new('ShaderNodeMix')
    mixu.data_type = 'FLOAT'
    L.new(gt.outputs[0], mixu.inputs[0])
    L.new(sep_p.outputs['Y'], mixu.inputs[2])
    L.new(sep_p.outputs['X'], mixu.inputs[3])
    comb = n.new('ShaderNodeCombineXYZ')
    sx = n.new('ShaderNodeMath')
    sx.operation = 'MULTIPLY'
    sx.inputs[1].default_value = 1.0 / cell[0]
    L.new(mixu.outputs[0], sx.inputs[0])
    sz = n.new('ShaderNodeMath')
    sz.operation = 'MULTIPLY'
    sz.inputs[1].default_value = 1.0 / cell[1]
    L.new(sep_p.outputs['Z'], sz.inputs[0])
    off = n.new('ShaderNodeMath')
    off.operation = 'ADD'
    off.inputs[1].default_value = seed * 7.31
    L.new(sx.outputs[0], off.inputs[0])
    L.new(off.outputs[0], comb.inputs['X'])
    L.new(sz.outputs[0], comb.inputs['Y'])
    brick = n.new('ShaderNodeTexBrick')
    brick.offset = 0.0
    brick.squash = 1.0
    brick.inputs['Color1'].default_value = (0, 0, 0, 1)
    brick.inputs['Color2'].default_value = (1, 1, 1, 1)
    brick.inputs['Mortar'].default_value = (0, 0, 0, 1)
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = 0.46
    brick.inputs['Mortar Smooth'].default_value = 0.1
    brick.inputs['Bias'].default_value = 0.0
    brick.inputs['Brick Width'].default_value = 1.0
    brick.inputs['Row Height'].default_value = 1.0
    L.new(comb.outputs[0], brick.inputs['Vector'])
    # brick.Color is a random grey per cell (inside the window) and black on the mortar (the wall)
    ramp = n.new('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'CONSTANT'
    cr.elements[0].position = 0.0
    cr.elements[0].color = (0, 0, 0, 1)
    t0 = 1.0 - lit_ratio
    stops = [(t0, (1.0, 0.62, 0.3)), (t0 + lit_ratio * 0.45, (1.0, 0.82, 0.55)),
             (t0 + lit_ratio * 0.7, (0.75, 0.92, 1.0)), (t0 + lit_ratio * 0.88, (0.35, 0.5, 1.0))]
    for pos, col in stops:
        e = cr.elements.new(min(pos, 0.999))
        e.color = (*col, 1)
    L.new(brick.outputs['Color'], ramp.inputs[0])
    win = n.new('ShaderNodeMath')
    win.operation = 'SUBTRACT'
    win.inputs[0].default_value = 1.0
    L.new(brick.outputs['Fac'], win.inputs[1])
    # only vertical faces get windows
    vert = n.new('ShaderNodeMath')
    vert.operation = 'LESS_THAN'
    vert.inputs[1].default_value = 0.5
    absz = n.new('ShaderNodeMath')
    absz.operation = 'ABSOLUTE'
    L.new(sep_n.outputs['Z'], absz.inputs[0])
    L.new(absz.outputs[0], vert.inputs[0])
    mask = n.new('ShaderNodeMath')
    mask.operation = 'MULTIPLY'
    L.new(win.outputs[0], mask.inputs[0])
    L.new(vert.outputs[0], mask.inputs[1])
    em = n.new('ShaderNodeEmission')
    L.new(ramp.outputs['Color'], em.inputs['Color'])
    st = n.new('ShaderNodeMath')
    st.operation = 'MULTIPLY'
    st.inputs[1].default_value = strength
    L.new(mask.outputs[0], st.inputs[0])
    L.new(st.outputs[0], em.inputs['Strength'])
    add = n.new('ShaderNodeAddShader')
    L.new(bsdf.outputs[0], add.inputs[0])
    L.new(em.outputs[0], add.inputs[1])
    L.new(add.outputs[0], out.inputs[0])
    return m


M_WET = lib.material('M_WetRoad', color=(0.025, 0.025, 0.028), rough=0.12, spec=0.6)
M_PAVE = lib.material('M_Pavement', color=(0.08, 0.075, 0.07), rough=0.35)
M_ROOF = lib.material('M_Roof', color=(0.06, 0.055, 0.05), rough=0.6)
M_DARK = lib.material('M_Dark', color=(0.02, 0.02, 0.02), rough=0.7)
M_POLE = lib.material('M_Pole', color=(0.12, 0.12, 0.12), rough=0.5, metal=0.6)
M_TANK = lib.material('M_Tank', color=(0.015, 0.015, 0.015), rough=0.4)
M_PALM = lib.material('M_Palm', color=(0.02, 0.03, 0.015), rough=0.8)
M_TRUNK = lib.material('M_Trunk', color=(0.05, 0.04, 0.03), rough=0.9)
M_TEMPLE = lib.material('M_Temple', color=(0.55, 0.42, 0.28), rough=0.9)
M_SODIUM = emissive('E_Sodium', (1.0, 0.5, 0.16), 60)
M_LED = emissive('E_LED', (0.85, 0.92, 1.0), 40)
M_TUBE = emissive('E_Tube', (0.8, 1.0, 0.88), 9)
M_RED = emissive('E_Red', (1.0, 0.04, 0.02), 30)
M_NEON_RED = emissive('E_NeonRed', (1.0, 0.12, 0.08), 18)
M_NEON_GREEN = emissive('E_NeonGreen', (0.2, 1.0, 0.35), 14)
M_SHOP_WARM = emissive('E_ShopWarm', (1.0, 0.7, 0.4), 1.4)
M_SHOP_COOL = emissive('E_ShopCool', (0.82, 0.95, 1.0), 1.5)
M_TAIL = emissive('E_Tail', (1.0, 0.05, 0.02), 40)
M_HEAD = emissive('E_Head', (1.0, 0.92, 0.8), 80)
M_SIGNS = [emissive(f'E_Sign{i}', c, s) for i, (c, s) in enumerate([
    ((1.0, 0.82, 0.2), 3.2), ((0.2, 0.55, 1.0), 3.0), ((1.0, 0.3, 0.2), 3.0), ((0.95, 0.95, 0.9), 2.4),
    ((0.3, 1.0, 0.6), 2.6), ((1.0, 0.5, 0.9), 2.4)])]
FACADES = [facade_material(f'M_Facade{i}', wall, lit, i, strength=s) for i, (wall, lit, s) in enumerate([
    ((0.16, 0.14, 0.12), 0.35, 5), ((0.2, 0.17, 0.13), 0.28, 5), ((0.12, 0.12, 0.13), 0.45, 6),
    ((0.22, 0.2, 0.16), 0.22, 4), ((0.15, 0.13, 0.14), 0.4, 6), ((0.1, 0.1, 0.1), 0.5, 7)])]


def box(sz, loc, mat, rot=0.0, name='b'):
    o = lib.box(name, sz, loc, C, mat, bevel=0.0, weighted=False, rot=(0, 0, rot))
    return o


def light(kind, loc, energy, color, size=0.2, rot=(0, 0, 0), spot=None):
    ld = bpy.data.lights.new('L', kind)
    ld.energy = energy
    ld.color = color
    ld.shadow_soft_size = size
    if spot:
        ld.spot_size, ld.spot_blend = spot
    o = bpy.data.objects.new('L', ld)
    C.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    return o


# ----------------------------------------------------------------------------- Thanjavur pieces
# Layout, as seen from the desk: the Big Temple's floodlit vimana fills the right pane (lon ~+9°), a gopuram on
# either side, the domed palace and a lodge with Tamil rooftop letters on the left, low-rise rooftops with water
# tanks, coconut palms and banana plants, shop rows with Tamil neon boards on the street below.
M_STONE = lib.material('M_TempleStone', color=(0.62, 0.45, 0.28), rough=0.85, emission=(1.0, 0.56, 0.26),
                       emission_strength=0.1)   # granite, glowing orange under the floodlights
M_STONE_DK = lib.material('M_TempleStoneDark', color=(0.34, 0.24, 0.15), rough=0.9)
M_PAINT = lib.material('M_GopuramStucco', color=(0.72, 0.56, 0.38), rough=0.8, emission=(1.0, 0.62, 0.34), emission_strength=0.18)
M_GILT = lib.material('M_Gilt', color=(1.0, 0.72, 0.32), rough=0.3, metal=1.0)
M_BULB = emissive('E_TempleBulbs', (1.0, 0.68, 0.34), 24)
M_PARAPET = lib.material('M_Parapet', color=(0.2, 0.17, 0.14), rough=0.8)
M_BANANA = lib.material('M_BananaLeaf', color=(0.035, 0.07, 0.02), rough=0.55)
M_STEM = lib.material('M_BananaStem', color=(0.05, 0.07, 0.03), rough=0.7)
M_TIN = [lib.material(f'M_Awning{i}', color=c, rough=0.45, metal=0.3) for i, c in enumerate(
    [(0.03, 0.09, 0.22), (0.04, 0.16, 0.08), (0.2, 0.04, 0.03), (0.16, 0.12, 0.03)])]
M_BUS = lib.material('M_Bus', color=(0.55, 0.55, 0.52), rough=0.4)
M_BUS_WIN = emissive('E_BusWindows', (0.95, 0.95, 0.85), 4.0)
M_ARCH = emissive('E_PalaceArch', (1.0, 0.64, 0.32), 2.4)
M_GATE = emissive('E_GateGlow', (1.0, 0.6, 0.28), 3.0)
FACADES_LIGHT = [facade_material(f'M_FacadeLight{i}', wall, lit, 20 + i, strength=s) for i, (wall, lit, s) in enumerate([
    ((0.34, 0.28, 0.2), 0.38, 4), ((0.3, 0.27, 0.22), 0.32, 4), ((0.36, 0.3, 0.24), 0.4, 5)])]

# neon sign textures drawn by scripts/make-signs.mjs (the browser shapes Tamil correctly; Blender text does not)
SIGN_DIR = os.path.join(lib.GEN, 'signs')
SIGN_META = json.load(open(os.path.join(SIGN_DIR, 'signs.json')))
BOARD_SIGNS = ['medicals_ta', 'medicals_en', 'unavagam', 'tea', 'silks', 'stores', 'bakery', 'mess', 'mobiles']
_sign_mats = {}


def sign_material(sid, strength):
    key = (sid, strength)
    if key not in _sign_mats:
        m = bpy.data.materials.new(f'E_SignTex_{sid}_{strength}')
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(os.path.join(SIGN_DIR, f'{sid}.png'), check_existing=True)
        tex.extension = 'CLIP'
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Strength'].default_value = strength
        nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(tex.outputs['Alpha'], mix.inputs['Fac'])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs[0])
        _sign_mats[key] = m
    return _sign_mats[key]


def sign(sid, width, loc, rot_z=0.0, strength=6.0):
    """Vertical sign facing -Y (towards the window) unless rotated."""
    h = width / SIGN_META[sid]['aspect']
    return lib.plane('Sign_' + sid, width, h, loc, C, sign_material(sid, strength), rot=(R(90), 0, rot_z))


def facing(p):
    """rot_z that turns a -Y facing sign at p towards the window."""
    d = EYE - Vector(p)
    return math.atan2(d.x, -d.y)


def boxes(name, specs, mat):
    """Many plain boxes in one mesh: specs = [((sx, sy, sz), (cx, cy, cz)), ...]."""
    bm = bmesh.new()
    for (sx, sy, sz), (cx, cy, cz) in specs:
        vs = [bm.verts.new((cx + dx * sx / 2, cy + dy * sy / 2, cz + dz * sz / 2))
              for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
        for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            bm.faces.new([vs[i] for i in f])
    return lib.bm_to_obj(name, bm, C, mat, smooth=False)


def light_points(name, pts, size, mat):
    """Tiny window-facing quads (string lights, distant bulbs)."""
    bm = bmesh.new()
    for p in pts:
        v = [bm.verts.new((p.x + dx * size, p.y, p.z + dz * size)) for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        bm.faces.new(v)
    return lib.bm_to_obj(name, bm, C, mat, smooth=False)


def balustrade(x0, x1, y, z, h=0.95, pitch=0.32):
    specs = [((x1 - x0, 0.24, 0.12), ((x0 + x1) / 2, y, z + h - 0.06)), ((x1 - x0, 0.26, 0.16), ((x0 + x1) / 2, y, z + 0.08))]
    n = max(2, int((x1 - x0) / pitch))
    specs += [((0.09, 0.09, h - 0.28), (x0 + (i + 0.5) * (x1 - x0) / n, y, z + 0.16 + (h - 0.28) / 2)) for i in range(n)]
    return boxes('Balustrade', specs, M_PARAPET)


def vimana(at, base=30.0):
    """Brihadeeswarar-style vimana: two-storey sanctum, 13 diminishing talas with miniature shrines, dome, kalasam."""
    specs_lt, specs_dk, bulbs = [], [], []
    z = 0.0
    for k, (wdt, ht) in enumerate([(base, 7.5), (base - 1.6, 6.0)]):
        specs_lt.append(((wdt, wdt, ht), (at.x, at.y, at.z + z + ht / 2)))
        for i in range(11):   # pilasters and niches on the window-facing and side walls
            u = -wdt / 2 + (i + 0.5) * wdt / 11
            tgt = specs_dk if i % 2 else specs_lt
            tgt.append(((0.9, 0.7, ht - 1.2), (at.x + u, at.y - wdt / 2 - 0.3, at.z + z + ht / 2)))
            for sx in (-1, 1):
                tgt.append(((0.7, 0.9, ht - 1.2), (at.x + sx * (wdt / 2 + 0.3), at.y + u, at.z + z + ht / 2)))
        specs_lt.append(((wdt + 1.4, wdt + 1.4, 0.8), (at.x, at.y, at.z + z + ht - 0.4)))
        bulbs += [Vector((at.x - (wdt + 1.4) / 2 + (i + 0.5) * (wdt + 1.4) / 28, at.y - (wdt + 1.4) / 2 - 0.1, at.z + z + ht - 0.4))
                  for i in range(28)]
        z += ht
    wdt = base - 3.5
    for k in range(13):
        ht = 3.25
        specs_lt.append(((wdt, wdt, ht), (at.x, at.y, at.z + z + ht / 2)))
        n = max(3, int(wdt / 2.4))
        for i in range(n):
            u = -wdt / 2 + (i + 0.5) * wdt / n
            hh = 1.5 if i in (0, n - 1) else (1.15 if i % 2 else 0.85)
            specs_lt.append(((wdt / n * 0.66, 1.3, hh), (at.x + u, at.y - wdt / 2 + 0.65, at.z + z + ht + hh / 2)))
            for sx in (-1, 1):
                specs_lt.append(((1.3, wdt / n * 0.66, hh), (at.x + sx * (wdt / 2 - 0.65), at.y + u, at.z + z + ht + hh / 2)))
        m = int(wdt / 1.05)
        bulbs += [Vector((at.x - wdt / 2 + (i + 0.5) * wdt / m, at.y - wdt / 2 - 0.12, at.z + z + ht - 0.15)) for i in range(m)]
        for sx in (-1, 1):
            bulbs += [Vector((at.x + sx * (wdt / 2 + 0.12), at.y - wdt / 2 + (i + 0.5) * wdt / (m // 2), at.z + z + ht - 0.15))
                      for i in range(m // 2)]
        z += ht
        wdt -= 1.45
    specs_lt.append(((wdt + 1.2, wdt + 1.2, 2.2), (at.x, at.y, at.z + z + 1.1)))
    z += 2.2
    boxes('Vimana', specs_lt, M_STONE)
    boxes('VimanaNiches', specs_dk, M_STONE_DK)
    lib.lathe('Shikhara', [(0, 0), (5.6, 0.0), (6.8, 1.9), (6.6, 4.2), (4.7, 6.2), (1.9, 7.4), (0, 7.6)], C, M_STONE,
              segs=8, loc=at + Vector((0, 0, z)), rot=(0, 0, R(22.5)))
    lib.lathe('Kalasam', [(0, 0), (0.9, 0.4), (1.15, 1.6), (0.5, 2.8), (0.2, 3.8), (0, 4.3)], C, M_GILT, segs=12,
              loc=at + Vector((0, 0, z + 7.6)))
    light_points('VimanaBulbs', bulbs, 0.17, M_BULB)
    return z + 13.2


def gopuram(at, w, d, tiers, name):
    """Temple gateway tower: granite base with a lit doorway, stepped stucco storeys, barrel-vault crown."""
    specs, bulbs = [], []
    hb = 8.5
    specs.append(((w, d, hb), (at.x, at.y, at.z + hb / 2)))
    lib.plane(name + '_Door', w * 0.16, hb * 0.62, (at.x, at.y - d / 2 - 0.05, at.z + hb * 0.31), C, M_GATE, rot=(R(90), 0, 0))
    z, ww, dd = hb, w, d
    for k in range(tiers):
        ht = 3.0
        specs.append(((ww, dd, ht), (at.x, at.y, at.z + z + ht / 2)))
        specs.append(((ww + 0.7, dd + 0.7, 0.45), (at.x, at.y, at.z + z + ht - 0.22)))
        for i in range(int(ww / 2.2)):   # stucco figure niches
            u = -ww / 2 + (i + 0.5) * ww / int(ww / 2.2)
            specs.append(((0.8, 0.5, ht - 0.9), (at.x + u, at.y - dd / 2 - 0.25, at.z + z + ht / 2)))
        m = int(ww / 1.15)
        bulbs += [Vector((at.x - ww / 2 + (i + 0.5) * ww / m, at.y - dd / 2 - 0.4, at.z + z + ht - 0.2)) for i in range(m)]
        z += ht
        ww -= w * 0.072
        dd -= d * 0.052
    boxes(name, specs, M_PAINT)
    lib.cylinder(name + '_Vault', dd * 0.46, ww, at + Vector((0, 0, z + dd * 0.08)), C, M_PAINT, segs=14,
                 rot=(0, R(90), 0), bottom=False)
    for i in range(7):
        lib.lathe('Kalasam', [(0, 0), (0.42, 0.2), (0.52, 0.8), (0.24, 1.4), (0, 1.9)], C, M_GILT, segs=10,
                  loc=at + Vector((-ww * 0.42 + i * ww * 0.14, 0, z + dd * 0.52)))
    light_points(name + '_Bulbs', bulbs, 0.15, M_BULB)
    return z + dd * 0.55 + 1.9


def palace(at):
    """Long two-storey hall with lit arcades and four domed towers (after the Maratha palace)."""
    w, d, h = 36.0, 14.0, 12.0
    box((w, d, h), at + Vector((0, 0, h / 2)), FACADES_LIGHT[0], name='Palace')
    box((w + 1.0, d + 1.0, 0.6), at + Vector((0, 0, h + 0.3)), M_STONE, name='PalaceCornice')
    arches = []
    for i in range(12):
        u = -w / 2 + (i + 0.5) * w / 12
        arches += [((1.5, 0.3, 2.8), (at.x + u, at.y - d / 2 - 0.15, at.z + 2.1)), ((1.5, 0.3, 2.3), (at.x + u, at.y - d / 2 - 0.15, at.z + 7.6))]
    boxes('PalaceArches', arches, M_ARCH)
    balustrade(at.x - w / 2, at.x + w / 2, at.y - d / 2 + 0.3, at.z + h + 0.6)
    for sx in (-1.0, -0.34, 0.34, 1.0):
        tx = at.x + sx * (w / 2 - 3.2)
        th = h + (7.5 if abs(sx) == 1.0 else 4.5)
        ty = at.y - d / 2 + 3.2
        lib.cylinder('PalaceDrum', 3.1, th, Vector((tx, ty, at.z)), C, M_STONE, segs=16)
        lib.lathe('PalaceDome', [(0, 0), (3.4, 0.0), (3.95, 1.7), (3.5, 3.5), (2.2, 4.9), (0.6, 5.9), (0.2, 6.7), (0, 7.1)],
                  C, M_STONE, segs=24, loc=Vector((tx, ty, at.z + th)))
        lib.lathe('PalaceFinial', [(0, 0), (0.3, 0.2), (0.2, 1.2), (0, 1.6)], C, M_GILT, segs=8, loc=Vector((tx, ty, at.z + th + 7.1)))
        light_points('PalaceDomeBulbs', [Vector((tx + 3.45 * math.sin(a), ty - 3.45 * abs(math.cos(a)), at.z + th + 0.1))
                                         for a in [R(-80 + 10 * k) for k in range(17)]], 0.14, M_BULB)
    light('SPOT', at + Vector((0, -38, 1.0)), 7.0e5, (1.0, 0.7, 0.42), size=1.0, rot=(R(110), 0, 0), spot=(R(80), 0.5))


def palm(base, height, lean, seed, detail=1.0):
    rr = lib.rng(seed)
    top = base + Vector((lean[0], lean[1], height))
    mid = base + Vector((lean[0] * 0.35, lean[1] * 0.35, height * 0.55))
    lib.curve_tube('Trunk', [base, mid, top], 0.17, C, M_TRUNK, res=8)
    for k in range(13 if detail >= 1 else 10):
        a = k / 13 * math.tau + rr.uniform(-0.2, 0.2)
        L_ = rr.uniform(3.2, 4.6)
        droop = rr.uniform(0.9, 2.2)
        pts = [top + Vector((math.cos(a) * L_ * s / 5, math.sin(a) * L_ * s / 5, 0.4 * s / 5 - droop * (s / 5) ** 2))
               for s in range(6)]
        lib.curve_tube('Frond', pts, 0.09, C, M_PALM, res=4, bevel_res=1)
        for s in range(1, 6, 1 if detail >= 1 else 2):
            p = pts[s]
            n = Vector((-math.sin(a), math.cos(a), 0))
            for sg in (-1, 1):
                q = p + n * sg * 0.9 + Vector((0, 0, -0.7))
                lib.curve_tube('Leaf', [p, (p + q) / 2 + Vector((0, 0, 0.1)), q], 0.05, C, M_PALM, res=3, bevel_res=1)


def banana(at, seed, height=3.0):
    rr = lib.rng(seed)
    lib.cylinder('BananaStem', 0.16, height, at, C, M_STEM, segs=8, r2=0.11)
    bm = bmesh.new()
    for k in range(8):
        a = k / 8 * math.tau + rr.uniform(-0.3, 0.3)
        L_, W_, droop = rr.uniform(1.9, 2.7), rr.uniform(0.32, 0.48), rr.uniform(0.5, 1.3)
        top = at + Vector((0, 0, height - rr.uniform(0, 0.35)))
        dv, sv = Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0))
        rows = []
        for s in range(7):
            t_ = s / 6
            c = top + dv * L_ * t_ + Vector((0, 0, 0.9 * t_ - droop * t_ * t_))
            wd = W_ * math.sin(math.pi * min(1.0, 0.12 + t_ * 0.95))
            rows.append((bm.verts.new(c - sv * wd), bm.verts.new(c + sv * wd)))
        for s in range(6):
            bm.faces.new((rows[s][0], rows[s][1], rows[s + 1][1], rows[s + 1][0]))
    lib.bm_to_obj('BananaLeaves', bm, C, M_BANANA, smooth=True)


def auto_rickshaw(at, heading=0.0):
    body = box((1.35, 2.5, 0.9), at + Vector((0, 0, 0.72)), M_AUTO, rot=heading, name='Auto')
    box((1.32, 2.15, 0.08), at + Vector((0, 0.08, 1.82)), M_BLACK, rot=heading, name='AutoTop')
    box((0.18, 0.12, 0.12), at + Vector((0, -1.28, 0.95)), M_HEAD, rot=heading, name='AutoLamp')
    return body


# ----------------------------------------------------------------------------- ground + street
lib.plane('Ground', 2400, 2400, (0, 1150, STREET - 0.02), C, M_ROOF)
lib.plane('Road', 400, 9.0, (0, 10.5, STREET), C, M_WET)
lib.plane('Footpath_Near', 400, 1.8, (0, 5.4, STREET + 0.15), C, M_PAVE)
lib.plane('Footpath_Far', 400, 1.8, (0, 15.9, STREET + 0.15), C, M_PAVE)
for i in range(40):   # puddle sheen
    lib.plane('Puddle', rnd.uniform(0.8, 3.0), rnd.uniform(0.4, 1.4), (rnd.uniform(-60, 60), rnd.uniform(6.5, 14.5), STREET + 0.005),
              C, M_WET)

# ----------------------------------------------------------------------------- shop rows across the street
x = -95.0
idx = 0
sign_cycle = list(BOARD_SIGNS)
while x < 95:
    w = rnd.uniform(5.5, 10.5)
    h = rnd.choice([6.4, 6.8, 7.2, 7.0, 7.6, 6.6, 9.8])
    d = rnd.uniform(9, 14)
    cx = x + w / 2
    y0 = 17.0
    fac = (FACADES + FACADES_LIGHT)[idx % (len(FACADES) + len(FACADES_LIGHT))]
    box((w - 0.25, d, h), (cx, y0 + d / 2, STREET + h / 2), fac, name='Shop')
    box((w - 0.25, 1.1, 0.18), (cx, y0 - 0.5, STREET + 3.55), M_PARAPET, name='Balcony')    # first-floor balcony slab
    balustrade(cx - (w - 0.4) / 2, cx + (w - 0.4) / 2, y0 - 0.95, STREET + 3.64, h=0.85)
    balustrade(cx - (w - 0.3) / 2, cx + (w - 0.3) / 2, y0 + 0.14, STREET + h)                 # roof parapet
    if rnd.random() < 0.8:   # black water tanks: on nearly every Tamil Nadu rooftop
        for k in range(rnd.choice([1, 1, 2])):
            lib.cylinder('Tank', rnd.uniform(0.6, 0.85), rnd.uniform(1.1, 1.5),
                         (cx + rnd.uniform(-w / 3, w / 3), y0 + rnd.uniform(2, d - 2), STREET + h), C, M_TANK, segs=16)
    if rnd.random() < 0.35:  # stair headroom
        box((2.4, 2.6, 2.4), (cx + rnd.uniform(-w / 4, w / 4), y0 + d - 2.0, STREET + h + 1.2), fac, name='Headroom')
    if rnd.random() < 0.64:  # lit shop interior under a half-raised shutter, or closed
        box((w * 0.7, 0.1, 1.7), (cx, y0 - 0.02, STREET + 1.05), rnd.choice([M_SHOP_WARM, M_SHOP_COOL, M_SHOP_WARM]))
        box((w * 0.7, 0.14, 0.9), (cx, y0 - 0.04, STREET + 2.35), M_DARK)
    else:
        box((w * 0.8, 0.12, 2.6), (cx, y0 - 0.03, STREET + 1.4), M_DARK)
    if rnd.random() < 0.85:  # Tamil / English neon board above the shop front
        sid = sign_cycle[idx % len(sign_cycle)]
        sw = min(w * 0.86, 1.15 * SIGN_META[sid]['aspect'])
        sign(sid, sw, (cx, y0 - 1.0, STREET + 4.95), strength=7.0)
    box((1.2, 0.06, 0.06), (cx + rnd.uniform(-1, 1), y0 - 0.6, STREET + 2.9), M_TUBE)
    box((w * 0.9, 1.3, 0.07), (cx, y0 - 0.65, STREET + 3.02), rnd.choice(M_TIN), name='Awning')
    x += w
    idx += 1
# pharmacy cross
for sx, sz in ((0.35, 1.0), (1.0, 0.35)):
    box((sx, 0.08, sz), (-18.8, 15.9, STREET + 5.9), M_NEON_GREEN)

# ----------------------------------------------------------------------------- the lodge with Tamil rooftop letters (left pane)
HOTEL = Vector((-9.8, 70.0, STREET))         # lon ~ -8°
box((12.5, 12.0, 23.0), HOTEL + Vector((0, 6.0, 11.5)), facade_material('M_HotelFacade', (0.2, 0.17, 0.14), 0.58, 9, strength=6),
    name='Hotel')
balustrade(HOTEL.x - 6.1, HOTEL.x + 6.1, HOTEL.y + 0.2, HOTEL.z + 23.0)
LODGE = HOTEL + Vector((0, 0.6, 23.0))
box((12.0, 0.3, 0.3), (LODGE.x, LODGE.y + 0.5, LODGE.z + 0.4), M_POLE)
for k in range(5):
    box((0.14, 0.14, 4.0), (LODGE.x - 5.6 + k * 2.8, LODGE.y + 0.5, LODGE.z + 2.0), M_POLE)
sign('lodge_ta', 11.5, (LODGE.x, LODGE.y, LODGE.z + 2.4), strength=9.0)
sign('lodge_en', 9.0, (LODGE.x, HOTEL.y - 0.15, HOTEL.z + 21.6), strength=6.5)
light('POINT', LODGE + Vector((0, -2.5, 2.6)), 2600, (1.0, 0.16, 0.1), size=3.0)

# ----------------------------------------------------------------------------- street lights + poles + wires
poles = []
for k, px in enumerate(range(-90, 100, 24)):
    base = Vector((px + rnd.uniform(-2, 2), 5.0, STREET))
    lib.cylinder('Pole', 0.11, 8.0, base, C, M_POLE, segs=10)
    arm_end = base + Vector((0, 2.4, 7.6))
    lib.curve_tube('Arm', [base + Vector((0, 0, 7.2)), base + Vector((0, 1.2, 7.8)), arm_end], 0.05, C, M_POLE)
    sodium = k % 3 != 1
    box((0.5, 0.9, 0.18), arm_end + Vector((0, 0.2, -0.1)), M_SODIUM if sodium else M_LED)
    light('POINT', arm_end + Vector((0, 0.2, -0.45)), 1400 if sodium else 900,
          (1.0, 0.52, 0.18) if sodium else (0.85, 0.92, 1.0), size=0.35)
    poles.append(base + Vector((0, 0, 7.4)))
    box((1.6, 0.1, 0.1), base + Vector((0, 0, 6.9)), M_POLE)
for a, b in zip(poles[:-1], poles[1:]):
    for dx, dz in ((-0.7, -0.5), (0.0, -0.5), (0.7, -0.5), (0.0, 0.0)):
        p0, p1 = a + Vector((dx, 0, dz)), b + Vector((dx, 0, dz))
        lib.curve_tube('Wire', [p0, (p0 + p1) / 2 + Vector((0, 0, -0.9 - 0.3 * rnd.random())), p1], 0.012, C, M_DARK, res=12)
for p in poles[2:7]:
    q = Vector((p.x + rnd.uniform(-3, 3), 16.9, STREET + rnd.uniform(4.5, 6.0)))
    lib.curve_tube('Drop', [p + Vector((0, 0, -0.5)), (p + q) / 2 + Vector((0, 0, -1.2)), q], 0.01, C, M_DARK, res=10)

# vehicles: yellow autos, a town bus, two-wheelers and two cars with lights
M_AUTO = lib.material('M_Auto', color=(0.62, 0.45, 0.02), rough=0.35)
M_BLACK = lib.material('M_AutoTop', color=(0.02, 0.02, 0.02), rough=0.5)
for p, hd in (((-6.5, 14.4), 0.0), ((9.0, 8.4), R(180)), ((-21.0, 12.2), R(4)), ((27.0, 9.6), R(176))):
    auto_rickshaw(Vector((p[0], p[1], STREET)), hd)
BUS = Vector((3.5, 12.6, STREET))
box((11.0, 2.5, 2.7), BUS + Vector((0, 0, 1.75)), M_BUS, name='Bus')
box((9.4, 2.56, 0.85), BUS + Vector((-0.4, 0, 2.3)), M_BUS_WIN, name='BusWindows')
for s in (-0.8, 0.8):
    box((0.1, 0.25, 0.18), BUS + Vector((5.52, s, 0.9)), M_HEAD)
    box((0.1, 0.22, 0.16), BUS + Vector((-5.52, s, 0.95)), M_TAIL)
for i in range(8):
    p = Vector((rnd.uniform(-40, 40), 14.6 + rnd.uniform(-0.3, 0.3), STREET))
    box((0.4, 1.8, 0.9), p + Vector((0, 0, 0.6)), rnd.choice([M_DARK, M_AUTO, M_POLE]))
for i, (px, py, dirn) in enumerate(((-28.0, 8.3, 1), (18.0, 12.0, -1))):
    p = Vector((px, py, STREET))
    box((4.2, 1.75, 1.2), p + Vector((0, 0, 0.75)), M_DARK)
    for s in (-0.6, 0.6):
        box((0.12, 0.2, 0.12), p + Vector((dirn * 2.12, s, 0.8)), M_HEAD)
        box((0.1, 0.2, 0.1), p + Vector((-dirn * 2.12, s, 0.85)), M_TAIL)
    light('SPOT', p + Vector((dirn * 2.3, 0, 0.8)), 600, (1.0, 0.92, 0.8), size=0.1, rot=(0, R(90 * dirn), 0), spot=(R(70), 0.6))

# ----------------------------------------------------------------------------- palms and banana plants
palm(Vector((-22, 16.4, STREET)), 11.5, (0.8, -0.4), 1)
palm(Vector((31, 17.0, STREET)), 13.0, (-0.9, 0.3), 2)
palm(Vector((-58, 32, STREET + 6.4)), 10.0, (0.5, 0.2), 3)
palm(Vector((48, 38, STREET)), 14.0, (0.4, 0.6), 4)
palm(Vector((-4, 46, STREET)), 12.5, (-0.6, 0.4), 5)
palm(Vector((19, 70, STREET)), 13.5, (0.3, -0.3), 6)
for i in range(26):   # palms between the rooftops towards the temple
    y = rnd.uniform(34, 210)
    xx = rnd.uniform(-0.75, 0.75) * (y + 20)
    palm(Vector((xx, y, STREET)), rnd.uniform(11, 16.5), (rnd.uniform(-1, 1), rnd.uniform(-0.6, 0.6)), 40 + i, detail=0.5)
for i in range(14):
    banana(Vector((rnd.uniform(-70, 70), rnd.uniform(29, 36), STREET)), 80 + i, rnd.uniform(2.6, 3.6))

# ----------------------------------------------------------------------------- low-rise town (2–4 storeys, flat roofs)
for i in range(320):
    y = 36 + (rnd.random() ** 1.25) * 560
    spread = 60 + y * 0.9
    xx = rnd.uniform(-spread, spread)
    if abs(xx - HOTEL.x) < 10 and abs(y - HOTEL.y - 6) < 9:
        continue
    w, d = rnd.uniform(8, 20), rnd.uniform(8, 20)
    # 2–3 storeys: keeps the sight lines to the temple, gopurams and palace open (taller ones only off to the sides)
    h = rnd.choice([6.5, 7.0, 9.5, 10.0, 10.5, 11.0])
    if abs(math.degrees(math.atan2(xx, y))) > 26 or y > 320:
        h = rnd.choice([h, h, 13.5, rnd.uniform(14, 20)])
    fac = rnd.choice(FACADES + FACADES_LIGHT)
    box((w, d, h), (xx, y, STREET + h / 2), fac, rot=R(rnd.uniform(-5, 5)), name='Block')
    if y < 220 and rnd.random() < 0.45:
        balustrade(xx - w / 2 + 0.3, xx + w / 2 - 0.3, y - d / 2 + 0.2, STREET + h)
    if rnd.random() < 0.65:
        lib.cylinder('Tank', rnd.uniform(0.6, 0.9), rnd.uniform(1.1, 1.5), (xx + rnd.uniform(-w / 3, w / 3), y, STREET + h), C,
                     M_TANK, segs=12)
    if rnd.random() < 0.3:
        box((2.6, 2.6, 2.4), (xx + rnd.uniform(-w / 4, w / 4), y + rnd.uniform(-d / 4, d / 4), STREET + h + 1.2), fac, name='Headroom')
    if (y < 200 and rnd.random() < 0.2) or (y < 260 and rnd.random() < 0.08):
        sid = rnd.choice(BOARD_SIGNS)
        p = (xx, y - d / 2 - 0.3, STREET + h + 1.2)
        sign(sid, min(w * 0.8, 2.2 * SIGN_META[sid]['aspect']), p, rot_z=facing(p), strength=7.0)
# a handful of 5–7 storey lodges/hospitals, kept away from the temple's line of sight
for i in range(10):
    ang = R(rnd.choice([rnd.uniform(-42, -28), rnd.uniform(24, 42)]))
    dist = rnd.uniform(150, 650)
    xx, yy = math.sin(ang) * dist, math.cos(ang) * dist
    h = rnd.uniform(16, 26)
    w = rnd.uniform(14, 24)
    box((w, rnd.uniform(12, 20), h), (xx, yy, STREET + h / 2), FACADES[(i % 3) + 2], rot=R(rnd.uniform(-8, 8)), name='Tower')
    if rnd.random() < 0.4:
        sid = rnd.choice(BOARD_SIGNS)
        p = (xx, yy - 8, STREET + h + 1.6)
        sign(sid, min(w * 0.7, 3.0 * SIGN_META[sid]['aspect']), p, rot_z=facing(p), strength=8.0)
HO = Vector((-70.0, 100.0, STREET + 9.0))   # floodlit hoarding, off to the left
box((14.0, 0.4, 6.0), HO + Vector((0, 0, 3.0)), emissive('E_Hoarding', (1.0, 0.93, 0.78), 2.6))
for k in range(3):
    box((0.2, 0.2, 3.0), HO + Vector((-5 + k * 5, 0.6, -1.5)), M_POLE)
TOWER = Vector((120, 230, STREET))         # mobile tower with red aviation lights, beyond the right frame
for k in range(4):
    a = R(45 + k * 90)
    lib.curve_tube('TowerLeg', [TOWER + Vector((math.cos(a) * 3, math.sin(a) * 3, 0)),
                                TOWER + Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, 55))], 0.12, C, M_POLE, res=2)
for z in (20, 38, 55):
    lib.cylinder('TowerLamp', 0.45, 0.45, TOWER + Vector((0, 0, z)), C, M_RED, segs=12)

# far city: thousands of small lights on the ground to the horizon
bm = bmesh.new()
for i in range(9000):
    y = 260 + (rnd.random() ** 0.8) * 1500
    spread = 120 + y * 0.95
    xx = rnd.uniform(-spread, spread)
    z = STREET + rnd.choice([0.5, 3, 6, 9, 14, 20]) * rnd.random()
    s = rnd.uniform(0.35, 0.9) * (1 + y / 900)
    v = [bm.verts.new((xx + dx * s, y, z + dz * s)) for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(v)
far = lib.bm_to_obj('FarLights', bm, C, None, smooth=False)
far_mats = [emissive(f'E_Far{i}', c, s) for i, (c, s) in enumerate([
    ((1.0, 0.55, 0.2), 30), ((1.0, 0.75, 0.45), 22), ((0.85, 0.92, 1.0), 26), ((1.0, 0.85, 0.6), 18)])]
for m in far_mats:
    far.data.materials.append(m)
for p in far.data.polygons:
    p.material_index = rnd.randrange(len(far_mats))
# arterial roads radiating away: rows of sodium lights give the light field perspective
bm2 = bmesh.new()
for ang, x0 in ((-38, -30), (-14, -12), (9, 22), (31, 60), (58, 90)):
    a = R(ang)
    for k in range(70):
        dist = 80 + k * 26
        for side in (-1, 1):
            px_ = x0 + math.sin(a) * dist + side * 9 * math.cos(a)
            py_ = 30 + math.cos(a) * dist + side * -9 * math.sin(a)
            if py_ < 60:
                continue
            ss = 0.55 * (1 + dist / 700)
            v = [bm2.verts.new((px_ + dx * ss, py_, STREET + 8 + dz * ss)) for dx, dz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            bm2.faces.new(v)
roadl = lib.bm_to_obj('RoadLights', bm2, C, emissive('E_RoadSodium', (1.0, 0.52, 0.18), 55), smooth=False)
for i in range(140):   # distant low blocks as dark silhouettes against the glow
    y = rnd.uniform(320, 900)
    xx = rnd.uniform(-(200 + y), 200 + y)
    w, d, h = rnd.uniform(15, 40), rnd.uniform(15, 40), rnd.uniform(6, 22)
    box((w, d, h), (xx, y, STREET + h / 2), rnd.choice(FACADES), name='FarBlock')

# ----------------------------------------------------------------------------- the Big Temple, its gopurams and the palace
TEMPLE = Vector((36.0, 205.0, STREET))           # lon ~ +10°, 208 m: fills the right pane
th = vimana(TEMPLE)
specs = []                                        # prakaram: the compound wall and the cloister roofline
for sx in (-1, 1):
    specs.append(((1.6, 120.0, 6.0), (TEMPLE.x + sx * 60, TEMPLE.y + 10, STREET + 3.0)))
specs.append(((121.6, 1.6, 6.0), (TEMPLE.x, TEMPLE.y - 50, STREET + 3.0)))
boxes('Prakaram', specs, M_STONE_DK)
light_points('PrakaramBulbs', [Vector((TEMPLE.x - 60 + i * 1.6, TEMPLE.y - 50.9, STREET + 6.1)) for i in range(76)], 0.14, M_BULB)
for dx in (-26, 0, 26):
    light('SPOT', TEMPLE + Vector((dx, -46, 1.0)), 1.7e6, (1.0, 0.66, 0.34), size=1.0, rot=(R(118), 0, 0), spot=(R(68), 0.4))
gopuram(Vector((95.0, 300.0, STREET)), 24.0, 13.0, 9, 'GopuramRight')      # lon ~ +17.5°
gopuram(Vector((-122.0, 274.0, STREET)), 26.0, 14.0, 10, 'GopuramLeft')    # lon ~ -24°, rises behind the palace
for g, dx in (((95.0, 300.0), 0), ((-122.0, 274.0), 0)):
    light('SPOT', Vector((g[0], g[1] - 30, STREET + 1)), 9.0e5, (1.0, 0.68, 0.38), size=1.0, rot=(R(112), 0, 0), spot=(R(60), 0.4))
palace(Vector((-52.0, 143.0, STREET)))                                   # lon ~ -20°

# sodium street lamps along the streets between the rooftops (sparkle in the middle distance)
lamps = []
for yy in (44, 62, 84, 108, 136, 168, 204, 244, 290):
    spread = 60 + yy * 0.9
    xx = -spread + rnd.uniform(0, 6)
    while xx < spread:
        lamps.append(Vector((xx, yy + rnd.uniform(-1.5, 1.5), STREET + rnd.uniform(5.0, 6.5))))
        xx += rnd.uniform(6, 10)
light_points('StreetLamps', lamps, 0.3, emissive('E_StreetLamp', (1.0, 0.56, 0.2), 70))

# ----------------------------------------------------------------------------- sky
world = bpy.data.worlds.new('NightSky')
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputWorld')
bg = nt.nodes.new('ShaderNodeBackground')
tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(tc.outputs['Generated'], sep.inputs[0])
noise = nt.nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 3.0
noise.inputs['Detail'].default_value = 6.0
nt.links.new(tc.outputs['Generated'], noise.inputs['Vector'])
ramp = nt.nodes.new('ShaderNodeValToRGB')
cr = ramp.color_ramp
cr.elements[0].position = 0.0
cr.elements[0].color = (0.11, 0.08, 0.065, 1)       # orange sodium glow at the horizon
cr.elements[1].position = 0.32
cr.elements[1].color = (0.028, 0.032, 0.045, 1)     # overcast, lit from below by the city
e = cr.elements.new(0.1)
e.color = (0.06, 0.05, 0.05, 1)
mz = nt.nodes.new('ShaderNodeMath')
mz.operation = 'MAXIMUM'
mz.inputs[1].default_value = 0.0
nt.links.new(sep.outputs['Z'], mz.inputs[0])
nt.links.new(mz.outputs[0], ramp.inputs[0])
mul = nt.nodes.new('ShaderNodeMix')
mul.data_type = 'RGBA'
mul.blend_type = 'MULTIPLY'
mul.inputs[0].default_value = 0.45
nt.links.new(ramp.outputs['Color'], mul.inputs[6])
nt.links.new(noise.outputs['Color'], mul.inputs[7])
nt.links.new(mul.outputs[2], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0
nt.links.new(bg.outputs[0], out.inputs[0])
# humid monsoon air: thin homogeneous fog gives halos around lights and swallows the far city
vol = nt.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Color'].default_value = (0.8, 0.72, 0.62, 1)
vol.inputs['Density'].default_value = 0.0012
vol.inputs['Anisotropy'].default_value = 0.45
nt.links.new(vol.outputs[0], out.inputs['Volume'])

# ----------------------------------------------------------------------------- camera: partial equirect from the window
cd = bpy.data.cameras.new('PanoCam')
cd.type = 'PANO'
cd.panorama_type = 'EQUIRECTANGULAR'
cd.longitude_min, cd.longitude_max = R(LON[0]), R(LON[1])
cd.latitude_min, cd.latitude_max = R(LAT[0]), R(LAT[1])
cd.clip_start = 0.1
cd.clip_end = 5000
cam = bpy.data.objects.new('PanoCam', cd)
C.objects.link(cam)
cam.location = EYE
cam.rotation_euler = (R(90), 0, 0)
scene.camera = cam

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'OPTIX'
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPTIX'
scene.cycles.max_bounces = 4
scene.cycles.volume_bounces = 1
scene.cycles.volume_step_rate = 4.0
scene.render.resolution_x = WIDTH
scene.render.resolution_y = int(WIDTH * (LAT[1] - LAT[0]) / (LON[1] - LON[0]))
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '16'
os.makedirs(lib.GEN, exist_ok=True)
scene.render.filepath = os.path.join(lib.GEN, 'city_pano.exr')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(lib.ROOT, 'assets-src', 'blend', 'city.blend'), compress=True)
bpy.ops.render.render(write_still=True)
print('CITY', scene.render.filepath, scene.render.resolution_x, scene.render.resolution_y)
