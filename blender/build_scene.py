"""Builds the complete desk room and saves assets-src/blend/room.blend.

Run:  blender -b --factory-startup --python-exit-code 1 -P blender/build_scene.py

Collections
  STATIC   – lightmapped, never moves (room, desk, props)
  DYNAMIC  – moves at runtime (notepad, résumé sheet, VCR door, tape template); realtime lit
  SCREENS  – emissive surfaces driven by canvas/video textures at runtime
  GLASS    – window panes (rain/reflection shader at runtime)
  DECALS   – printed labels whose textures are generated at runtime from content
  HELPERS  – empties that mark positions for the web app (stack bases, VCR slot, …)
"""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector, Matrix, Euler

sys.path.insert(0, os.path.dirname(__file__))
import lib  # noqa: E402
from lib import box, rounded_box, cylinder, lathe, plane, curve_tube, material, coll, ph_tex  # noqa: E402

R = math.radians
lib.reset()
scene = bpy.context.scene

C_STATIC = coll('STATIC')
C_DYN = coll('DYNAMIC')
C_SCREEN = coll('SCREENS')
C_GLASS = coll('GLASS')
C_DECAL = coll('DECALS')
C_HELP = coll('HELPERS')
C_EXT = coll('EXTERIOR')

SHOTS = json.load(open(os.path.join(lib.ROOT, 'src', 'scene', 'shots.json')))


def b3(v):
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    return Vector((v[0], -v[2], v[1]))


def empty(name, loc, rot=(0, 0, 0), parent=None, c=None):
    e = bpy.data.objects.new(name, None)
    (c or C_HELP).objects.link(e)
    e.empty_display_size = 0.05
    e.location = loc
    e.rotation_euler = rot
    if parent:
        e.parent = parent
    return e


def group(name, loc, rot=(0, 0, 0), c=C_STATIC):
    g = bpy.data.objects.new(name, None)
    c.objects.link(g)
    g.location = loc
    g.rotation_euler = rot
    return g


def parent(objs, g):
    for o in objs:
        o.parent = g


# ============================================================================ materials
T = ph_tex
M = {}


def hexc(h):
    """sRGB hex -> linear tuple (Blender colours are linear)."""
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


M['wall'] = material('M_Wall', color=(1.0, 0.95, 0.88), rough=0.92, tex=T('beige_wall_001', 'Diffuse'),
                     nor=T('beige_wall_001', 'nor_gl'), nor_strength=0.5)
M['ceiling'] = material('M_Ceiling', color=(1.0, 0.97, 0.92), rough=0.95, tex=T('beige_wall_001', 'Diffuse'))
M['floor'] = material('M_Floor', rough=0.55, tex=T('terracotta_floor_tiles', 'Diffuse'),
                      rough_tex=T('terracotta_floor_tiles', 'Rough'), nor=T('terracotta_floor_tiles', 'nor_gl'))
M['skirting'] = material('M_Skirting', color=(0.32, 0.17, 0.09), rough=0.5, tex=T('teak_veneer', 'Diffuse', '2k'))
M['curtain'] = material('M_Curtain', color=(1.0, 0.96, 0.9), rough=0.95, sheen=0.6, subsurface=0.0,
                        tex=T('terlenka', 'Diffuse'), nor=T('terlenka', 'nor_gl'), nor_strength=0.8)
M['frame'] = material('M_WindowFrame', color=(0.95, 0.78, 0.6), rough=0.42, coat=0.25,
                      tex=T('teak_veneer', 'Diffuse', '2k'), nor=T('teak_veneer', 'nor_gl', '2k'), nor_strength=0.3)
M['sill'] = material('M_Sill', color=(0.95, 0.8, 0.62), rough=0.38, coat=0.3, tex=T('teak_veneer', 'Diffuse', '2k'))
M['desk'] = material('M_Desk', color=(0.95, 0.66, 0.42), rough=0.36, coat=0.45, coat_rough=0.14,
                     tex=T('teak_veneer', 'Diffuse', '2k'), nor=T('teak_veneer', 'nor_gl', '2k'), nor_strength=0.25)
M['desk_frame'] = material('M_DeskFrame', color=(0.8, 0.52, 0.32), rough=0.42, coat=0.3,
                           tex=T('teak_veneer', 'Diffuse', '2k'), nor=T('teak_veneer', 'nor_gl', '2k'), nor_strength=0.3)
M['teak'] = material('M_SideDesk', color=(0.85, 0.62, 0.45), rough=0.45, coat=0.2, tex=T('teak_veneer', 'Diffuse', '2k'),
                     nor=T('teak_veneer', 'nor_gl', '2k'), nor_strength=0.4)
M['wardrobe'] = material('M_Wardrobe', rough=0.4, coat=0.3, tex=T('dark_wood', 'Diffuse'),
                         rough_tex=T('dark_wood', 'Rough'), nor=T('dark_wood', 'nor_gl'), nor_strength=0.4)
M['brass'] = material('M_Brass', color=hexc('#e2b874'), metal=1.0, rough=0.32)
M['chrome'] = material('M_Chrome', color=(0.8, 0.8, 0.8), metal=1.0, rough=0.22)
M['steel'] = material('M_Steel', color=(0.6, 0.6, 0.62), metal=1.0, rough=0.4)
M['tv'] = material('M_TVPlastic', color=hexc('#221f1d'), rough=0.42)
M['tv_inner'] = material('M_TVInner', color=hexc('#0d0d0d'), rough=0.6)
M['button'] = material('M_Button', color=hexc('#1c1c1c'), rough=0.35)
M['button_lt'] = material('M_ButtonLight', color=hexc('#6b6864'), rough=0.4)
M['knob'] = material('M_Knob', color=hexc('#121212'), rough=0.3)
M['vcr'] = material('M_VCRBody', color=hexc('#18181a'), rough=0.48)
M['vcr_front'] = material('M_VCRFront', color=hexc('#0e0e10'), rough=0.18)
M['vcr_slot'] = material('M_VCRSlot', color=(0.005, 0.005, 0.005), rough=0.8)
M['red'] = material('M_ButtonRed', color=hexc('#a32117'), rough=0.35)
M['led_green'] = material('M_LEDGreen', color=(0.1, 0.9, 0.3), rough=0.3, emission=(0.2, 1.0, 0.4), emission_strength=6)
M['led_red'] = material('M_LEDRed', color=(0.9, 0.1, 0.05), rough=0.3, emission=(1.0, 0.1, 0.05), emission_strength=4)
M['tape'] = material('M_TapeShell', color=(0.12, 0.2, 0.55), rough=0.4)
M['tape_window'] = material('M_TapeWindow', color=(0.02, 0.02, 0.025), rough=0.08, spec=0.6)
M['label'] = material('M_Label', color=hexc('#efebe0'), rough=0.85)
M['legal'] = material('M_LegalPaper', color=hexc('#f0d27a'), rough=0.85)
M['legal_edge'] = material('M_LegalEdge', color=hexc('#e9d394'), rough=0.95)
M['binding'] = material('M_LegalBinding', color=hexc('#7d2116'), rough=0.6)
M['paper'] = material('M_PaperWhite', color=hexc('#f1efe8'), rough=0.88)
M['lamp'] = material('M_LampPaint', color=hexc('#a8341f'), rough=0.36, coat=0.2)
M['lamp_inner'] = material('M_LampInner', color=hexc('#f1e8d8'), rough=0.5, emission=(1.0, 0.8, 0.55),
                           emission_strength=0.6)
M['bulb'] = material('M_Bulb', color=(1.0, 0.9, 0.75), rough=0.2, emission=(1.0, 0.78, 0.5), emission_strength=40)
M['ceramic'] = material('M_Ceramic', color=hexc('#efe9de'), rough=0.14, coat=0.4, coat_rough=0.06)
M['coffee'] = material('M_Coffee', color=hexc('#1c0e06'), rough=0.08)
M['discman'] = material('M_Discman', color=hexc('#4f6690'), metal=0.45, rough=0.38)
M['discman_lid'] = material('M_DiscmanLid', color=hexc('#a7aeb8'), metal=0.6, rough=0.32)
M['rubber'] = material('M_Rubber', color=(0.018, 0.018, 0.018), rough=0.85)
M['foam'] = material('M_Foam', color=hexc('#c95d1e'), rough=1.0, sheen=0.5)
M['beige'] = material('M_Beige', color=hexc('#d3c6ad'), rough=0.48)
M['beige_dk'] = material('M_BeigeDark', color=hexc('#a69a84'), rough=0.5)
M['keycap'] = material('M_Keycap', color=hexc('#cbbfa7'), rough=0.45)
M['keycap_dk'] = material('M_KeycapDark', color=hexc('#8f8472'), rough=0.45)
M['remote'] = material('M_RemoteBody', color=hexc('#161618'), rough=0.3)
M['floppy_blue'] = material('M_FloppyBlue', color=hexc('#2152a3'), rough=0.35)
M['floppy_black'] = material('M_FloppyBlack', color=hexc('#18181b'), rough=0.35)
M['calc'] = material('M_Calc', color=hexc('#202023'), rough=0.4)
M['lcd'] = material('M_LCD', color=hexc('#8f9b7d'), rough=0.15)
M['glass'] = material('M_Glass', color=(0.9, 0.95, 1.0), rough=0.02, transmission=1.0, ior=1.0, spec=0.6)
M['screen_tv'] = material('M_ScreenTV', color=(0.02, 0.02, 0.03), rough=0.1, emission=(0.05, 0.13, 0.95),
                          emission_strength=1.1)
M['screen_pc'] = material('M_ScreenPC', color=(0.02, 0.025, 0.02), rough=0.1, emission=(0.05, 0.4, 0.12),
                          emission_strength=0.8)
M['vfd'] = material('M_VFD', color=(0.01, 0.015, 0.015), rough=0.1, emission=(0.15, 1.0, 0.7), emission_strength=0.35)
M['decal'] = material('M_Decal', color=(0.85, 0.82, 0.75), rough=0.5)
M['poster'] = material('M_Poster', color=(0.18, 0.24, 0.72), rough=0.7)
M['tape_clear'] = material('M_StickyTape', color=(0.95, 0.93, 0.85), rough=0.4, alpha=0.55)
M['cable'] = material('M_Cable', color=(0.02, 0.02, 0.02), rough=0.55)
M['switchboard'] = material('M_SwitchPlate', color=hexc('#eeebe4'), rough=0.35)

# ============================================================================ room shell
ROOM_X0, ROOM_X1 = -1.75, 1.75
ROOM_Y0 = -3.4
CEIL = 2.65
WIN_X0, WIN_X1, WIN_Z0, WIN_Z1 = -0.88, 0.76, 0.91, 2.38
WCX = (WIN_X0 + WIN_X1) / 2
WALL_T = 0.30


def quad_plane(name, verts, c, mat, uv_scale=1.0):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    bm.faces.new(vs)
    o = lib.bm_to_obj(name, bm, c, mat, smooth=False)
    lib.uv_box(o, uv_scale)
    return o


floor = quad_plane('Floor', [(ROOM_X0, ROOM_Y0, 0), (ROOM_X1, ROOM_Y0, 0), (ROOM_X1, 0, 0), (ROOM_X0, 0, 0)],
                   C_STATIC, M['floor'], 1 / 1.2)
ceil = quad_plane('Ceiling', [(ROOM_X0, 0, CEIL), (ROOM_X1, 0, CEIL), (ROOM_X1, ROOM_Y0, CEIL), (ROOM_X0, ROOM_Y0, CEIL)],
                  C_STATIC, M['ceiling'], 1 / 2.0)
# side walls wound so their normals face into the room (they used to face out: unlit inside, see-through in three.js)
wall_l = quad_plane('Wall_Left', [(ROOM_X0, ROOM_Y0, 0), (ROOM_X0, 0, 0), (ROOM_X0, 0, CEIL), (ROOM_X0, ROOM_Y0, CEIL)],
                    C_STATIC, M['wall'], 1 / 2.0)
wall_r = quad_plane('Wall_Right', [(ROOM_X1, 0, 0), (ROOM_X1, ROOM_Y0, 0), (ROOM_X1, ROOM_Y0, CEIL), (ROOM_X1, 0, CEIL)],
                    C_STATIC, M['wall'], 1 / 2.0)
wall_b = quad_plane('Wall_Back', [(ROOM_X0, ROOM_Y0, 0), (ROOM_X0, ROOM_Y0, CEIL), (ROOM_X1, ROOM_Y0, CEIL),
                                  (ROOM_X1, ROOM_Y0, 0)], C_STATIC, M['wall'], 1 / 2.0)

# window wall with the opening (reveal faces included, exterior faces removed)
bm = lib.bm_box(ROOM_X1 - ROOM_X0, WALL_T, CEIL, center=(0, WALL_T / 2, CEIL / 2))
ww = lib.bm_to_obj('Wall_Window', bm, C_STATIC, M['wall'], smooth=False)
bm = lib.bm_box(WIN_X1 - WIN_X0, WALL_T * 3, WIN_Z1 - WIN_Z0, center=(0, WALL_T / 2, (WIN_Z0 + WIN_Z1) / 2))
cut = lib.bm_to_obj('cut', bm, C_STATIC, M['wall'], smooth=False)
lib.boolean_diff(ww, cut)
bm = bmesh.new()
bm.from_mesh(ww.data)
kill = []
for f in bm.faces:
    c = f.calc_center_median()
    n = f.normal
    if (n.y > 0.9 and c.y > WALL_T - 1e-3) or (abs(n.x) > 0.9 and abs(abs(c.x) - ROOM_X1) < 1e-3) or \
            (abs(n.z) > 0.9 and (c.z < 1e-3 or c.z > CEIL - 1e-3)):
        kill.append(f)
bmesh.ops.delete(bm, geom=kill, context='FACES')
bm.to_mesh(ww.data)
bm.free()
lib.uv_box(ww, 1 / 2.0)

# skirting boards
for nm, sz, loc in [
    ('Skirting_Left', (0.012, -ROOM_Y0, 0.07), (ROOM_X0 + 0.006, ROOM_Y0 / 2, 0.035)),
    ('Skirting_Right', (0.012, -ROOM_Y0, 0.07), (ROOM_X1 - 0.006, ROOM_Y0 / 2, 0.035)),
    ('Skirting_Window', (ROOM_X1 - ROOM_X0, 0.012, 0.07), (0, -0.006, 0.035)),
    ('Skirting_Back', (ROOM_X1 - ROOM_X0, 0.012, 0.07), (0, ROOM_Y0 + 0.006, 0.035)),
]:
    o = box(nm, sz, loc, C_STATIC, M['skirting'], bevel=0.003)
    lib.uv_box(o, 2.0)

# ============================================================================ window
FY0, FY1 = 0.10, 0.17          # outer frame depth inside the reveal
frame_parts = []


def fpart(name, x0, x1, z0, z1, y0=FY0, y1=FY1, bev=0.004):
    o = box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), C_STATIC, M['frame'],
            bevel=bev)
    frame_parts.append(o)
    return o


TR_Z0, TR_Z1 = 1.66, 1.73     # transom
fpart('Frame_L', WIN_X0, WIN_X0 + 0.06, WIN_Z0, WIN_Z1)
fpart('Frame_R', WIN_X1 - 0.06, WIN_X1, WIN_Z0, WIN_Z1)
fpart('Frame_B', WIN_X0, WIN_X1, WIN_Z0, WIN_Z0 + 0.06)
fpart('Frame_T', WIN_X0, WIN_X1, WIN_Z1 - 0.06, WIN_Z1)
fpart('Frame_Transom', WIN_X0 + 0.06, WIN_X1 - 0.06, TR_Z0, TR_Z1)
fpart('Frame_MullionTop', WCX - 0.03, WCX + 0.03, TR_Z1, WIN_Z1 - 0.06)
# lower casement sashes (sit slightly proud of the frame)
SY0, SY1 = 0.085, 0.152
for side, sx in (('L', -1), ('R', 1)):
    xo = (WIN_X1 - 0.06) if sx > 0 else (WIN_X0 + 0.06)   # outer edge
    xi = WCX + sx * 0.004                                 # meeting edge
    lo, hi = sorted((xo, xi))
    z0, z1 = WIN_Z0 + 0.06, TR_Z0
    fpart(f'Sash{side}_Outer', *(sorted((xo, xo - sx * 0.058))), z0, z1, SY0, SY1)
    fpart(f'Sash{side}_Inner', *(sorted((xi, xi + sx * 0.058))), z0, z1, SY0, SY1)
    fpart(f'Sash{side}_Bottom', lo, hi, z0, z0 + 0.075, SY0, SY1)
    fpart(f'Sash{side}_Top', lo, hi, z1 - 0.058, z1, SY0, SY1)
window_frame = lib.join(frame_parts, 'Window_Frame')
lib.uv_box(window_frame, 1.5)
lib.weighted_normals(window_frame)

# glass panes (UV 0..1 each; shader uses world position for parallax)
GLASS_Y = 0.118
panes = [
    ('Glass_L', WIN_X0 + 0.06 + 0.058, WCX - 0.062, WIN_Z0 + 0.06 + 0.075, TR_Z0 - 0.058, GLASS_Y),
    ('Glass_R', WCX + 0.062, WIN_X1 - 0.06 - 0.058, WIN_Z0 + 0.06 + 0.075, TR_Z0 - 0.058, GLASS_Y),
    ('Glass_TL', WIN_X0 + 0.06, WCX - 0.03, TR_Z1, WIN_Z1 - 0.06, 0.135),
    ('Glass_TR', WCX + 0.03, WIN_X1 - 0.06, TR_Z1, WIN_Z1 - 0.06, 0.135),
]
for nm, x0, x1, z0, z1, y in panes:
    o = plane(nm, x1 - x0, z1 - z0, ((x0 + x1) / 2, y, (z0 + z1) / 2), C_GLASS, M['glass'], rot=(R(90), 0, 0))
    lib.set_visibility(o, shadow=False)

# handle on the left sash's meeting stile
hg = group('Window_Handle', (WCX - 0.033, SY0 - 0.001, 1.36))
hb = box('Handle_Base', (0.028, 0.01, 0.075), (0, -0.005, 0), C_STATIC, M['brass'], bevel=0.003)
hs = cylinder('Handle_Spindle', 0.006, 0.022, (0, -0.01, 0.018), C_STATIC, M['brass'], rot=(R(90), 0, 0), segs=20)
hl = curve_tube('Handle_Lever', [(0, -0.03, 0.018), (0, -0.034, -0.02), (0.002, -0.036, -0.085)], 0.0065, C_STATIC,
                M['brass'])
parent([hb, hs, hl], hg)

# interior window board (sill)
sill = box('Window_Sill', (WIN_X1 - WIN_X0 + 0.1, 0.19, 0.03), (WCX, 0.045, WIN_Z0 - 0.015), C_STATIC, M['sill'], bevel=0.005)
lib.uv_box(sill, 1.5)

# ============================================================================ curtains


def curtain(name, x0, x1, ztop, zbot, ycen, pleats, amp, seed, flare=1.35):
    rnd = lib.rng(seed)
    nx, nz = 90, 36
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    phase = rnd.random() * math.tau
    jit = [rnd.uniform(0.75, 1.25) for _ in range(pleats * 2 + 2)]
    grid = []
    for j in range(nz + 1):
        t = j / nz  # 0 top .. 1 bottom
        z = ztop + (zbot - ztop) * t
        row = []
        for i in range(nx + 1):
            s = i / nx
            k = s * pleats * 2
            a = amp * jit[int(k) % len(jit)] * (1 + (flare - 1) * t ** 1.5)
            y = ycen + a * math.sin(math.pi * k + phase) + 0.012 * math.sin(7.0 * s + 3 * t) * t
            x = x0 + (x1 - x0) * s + 0.01 * t * math.sin(2.3 * s * math.pi)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    width = (x1 - x0) * 1.6
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]))
            for l, (a, b) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                l[uv].uv = (a / nx * width * 1.4, (1 - b / nz) * (ztop - zbot) * 1.4)
    o = lib.bm_to_obj(name, bm, C_STATIC, M['curtain'], smooth=True)
    m = o.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = 0.003
    m.offset = 0
    lib.apply_mods(o)
    return o


curtain('Curtain_L', -1.3, -0.74, 2.47, 0.945, -0.13, 6, 0.03, 3)
curtain('Curtain_R', 0.6, 0.94, 2.47, 0.945, -0.13, 4, 0.03, 7)
rod = cylinder('Curtain_Rod', 0.011, 2.55, (-1.45, -0.13, 2.5), C_STATIC, M['brass'], rot=(0, R(90), 0), segs=24)
for i, x in enumerate((-1.47, 1.12)):
    lib.lathe(f'Rod_Finial_{i}', [(0, -0.02), (0.016, -0.015), (0.022, 0.0), (0.016, 0.015), (0.0, 0.02)], C_STATIC,
              M['brass'], segs=24, loc=(x, -0.13, 2.5), rot=(0, R(90), 0))
for i, x in enumerate((-1.25, -0.06, 0.98)):
    box(f'Rod_Bracket_{i}', (0.012, 0.13, 0.012), (x, -0.065, 2.5), C_STATIC, M['brass'], bevel=0.002)
for i, x in enumerate([-1.28 + i * 0.062 for i in range(10)] + [0.62 + i * 0.064 for i in range(6)]):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=16, radius1=0.02, radius2=0.02, depth=0.006)
    lib.bm_to_obj(f'Curtain_Ring_{i}', bm, C_STATIC, M['brass'], loc=(x, -0.13, 2.5), rot=(0, R(90), 0))

# ============================================================================ desk
DESK_TOP = 0.76
DX0, DX1, DY0, DY1 = -1.02, 0.95, -0.78, -0.04
desk_top = box('Desk_Top', (DX1 - DX0, DY1 - DY0, 0.035), (0, (DY0 + DY1) / 2, DESK_TOP - 0.0175), C_STATIC,
               M['desk'], bevel=0.005, segments=4)
lib.uv_box(desk_top, 0.85)
parts = []
for nm, sz, loc in [
    ('ApronF', (1.85, 0.022, 0.085), (-0.035, -0.735, DESK_TOP - 0.035 - 0.0425)),
    ('ApronB', (1.85, 0.022, 0.085), (-0.035, -0.095, DESK_TOP - 0.035 - 0.0425)),
    ('ApronLft', (0.022, 0.62, 0.085), (-0.95, -0.415, DESK_TOP - 0.035 - 0.0425)),
    ('ApronRgt', (0.022, 0.62, 0.085), (0.88, -0.415, DESK_TOP - 0.035 - 0.0425)),
]:
    parts.append(box('Desk_' + nm, sz, loc, C_STATIC, M['desk_frame'], bevel=0.003))
for i, (x, y) in enumerate([(-0.935, -0.715), (0.865, -0.715), (-0.935, -0.115), (0.865, -0.115)]):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        k = 0.052 if v.co.z > 0 else 0.038
        v.co.x *= k
        v.co.y *= k
        v.co.z = (v.co.z + 0.5) * (DESK_TOP - 0.035)
    lib.bm_bevel(bm, 0.004, 2)
    parts.append(lib.bm_to_obj(f'Desk_Leg{i}', bm, C_STATIC, M['desk_frame'], loc=(x, y, 0)))
desk_frame = lib.join(parts, 'Desk_Frame')
lib.uv_box(desk_frame, 0.85, rot90_axes=(0, 1))
lib.weighted_normals(desk_frame)
drawer = box('Desk_Drawer', (0.62, 0.012, 0.07), (0.0, -0.751, DESK_TOP - 0.035 - 0.042), C_STATIC, M['desk'],
             bevel=0.003)
lib.uv_box(drawer, 0.85)
for i, x in enumerate((-0.12, 0.12)):
    cylinder(f'Drawer_Knob{i}', 0.009, 0.018, (x, -0.757, DESK_TOP - 0.077), C_STATIC, M['brass'], rot=(R(90), 0, 0),
             segs=20, bevel=0.002)

# side desk (computer corner) along the left wall
SX0, SX1, SY0_, SY1_ = -1.745, -1.13, -1.64, -0.66
SD_TOP = 0.74
sd = box('SideDesk_Top', (SX1 - SX0, SY1_ - SY0_, 0.03), ((SX0 + SX1) / 2, (SY0_ + SY1_) / 2, SD_TOP - 0.015),
         C_STATIC, M['teak'], bevel=0.004)
lib.uv_box(sd, 1.2, rot90_axes=(2,))
parts = []
for i, (x, y) in enumerate([(SX0 + 0.05, SY0_ + 0.05), (SX1 - 0.05, SY0_ + 0.05), (SX0 + 0.05, SY1_ - 0.05),
                            (SX1 - 0.05, SY1_ - 0.05)]):
    parts.append(box(f'SideDesk_Leg{i}', (0.045, 0.045, SD_TOP - 0.03), (x, y, (SD_TOP - 0.03) / 2), C_STATIC,
                     M['teak'], bevel=0.004))
parts.append(box('SideDesk_ApronF', (0.02, SY1_ - SY0_ - 0.1, 0.07), (SX1 - 0.05, (SY0_ + SY1_) / 2, SD_TOP - 0.065),
                 C_STATIC, M['teak'], bevel=0.003))
sdf = lib.join(parts, 'SideDesk_Frame')
lib.uv_box(sdf, 1.2)
lib.weighted_normals(sdf)

# wardrobe on the right wall
wg = []
WX0, WX1, WY0, WY1 = 1.16, 1.745, -1.95, -0.98
wg.append(box('Wardrobe_Body', (WX1 - WX0, WY1 - WY0, 2.02), ((WX0 + WX1) / 2, (WY0 + WY1) / 2, 1.01 + 0.04),
              C_STATIC, M['wardrobe'], bevel=0.006))
wg.append(box('Wardrobe_Cornice', (WX1 - WX0 + 0.04, WY1 - WY0 + 0.04, 0.05),
              ((WX0 + WX1) / 2 - 0.01, (WY0 + WY1) / 2, 2.09), C_STATIC, M['wardrobe'], bevel=0.008))
for i, (y0, y1) in enumerate(((WY0 + 0.02, (WY0 + WY1) / 2 - 0.003), ((WY0 + WY1) / 2 + 0.003, WY1 - 0.02))):
    wg.append(box(f'Wardrobe_Door{i}', (0.02, y1 - y0, 1.9), (WX0 - 0.008, (y0 + y1) / 2, 1.06), C_STATIC,
                  M['wardrobe'], bevel=0.005))
wardrobe = lib.join(wg, 'Wardrobe')
lib.uv_box(wardrobe, 1.0, rot90_axes=(0, 1))
lib.weighted_normals(wardrobe)
for i, y in enumerate(((WY0 + WY1) / 2 - 0.05, (WY0 + WY1) / 2 + 0.05)):
    box(f'Wardrobe_Handle{i}', (0.02, 0.012, 0.16), (WX0 - 0.028, y, 1.15), C_STATIC, M['brass'], bevel=0.003)

# ============================================================================ helpers for shapes


def rrect_outline(w, h, r, n=8):
    """Rounded rectangle outline in the XZ plane (counter-clockwise when viewed from -Y)."""
    pts = []
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    for cx, cz, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180),
                       (w / 2 - r, -h / 2 + r, 270)):
        for k in range(n + 1):
            a = R(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def frustum_cutter(name, w0, h0, r0, w1, h1, r1, y0, y1, zc):
    """Closed solid between two rounded rects (front at y0, back at y1)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z + zc)) for x, z in rrect_outline(w0, h0, r0)]
    b = [bm.verts.new((x, y1, z + zc)) for x, z in rrect_outline(w1, h1, r1)]
    n = len(a)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return lib.bm_to_obj(name, bm, C_STATIC, None, smooth=False)


def screen_mesh(name, w, h, r, bulge, c, mat, nx=28, ny=21):
    """Curved CRT face in local XZ (facing -Y), UV 0..1 across the visible rounded rect."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            x = (i / nx - 0.5) * w
            z = (j / ny - 0.5) * h
            # pull corner vertices onto the rounded corner arc
            ax, az = abs(x) - (w / 2 - r), abs(z) - (h / 2 - r)
            if ax > 0 and az > 0:
                d = math.hypot(ax, az)
                if d > r:
                    ax, az = ax * r / d, az * r / d
                    x = math.copysign(w / 2 - r + ax, x)
                    z = math.copysign(h / 2 - r + az, z)
            y = -bulge * (1 - (2 * x / w) ** 2) * (1 - (2 * z / h) ** 2)
            row.append((bm.verts.new((x, y, z)), (i / nx, j / ny)))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
            f = bm.faces.new([v for v, _ in q])
            for l, (_, t) in zip(f.loops, q):
                l[uv].uv = t
    return lib.bm_to_obj(name, bm, c, mat, smooth=True)


def hull(name, pts, c, mat, bevel=0.0, segs=3):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    bmesh.ops.convex_hull(bm, input=vs)
    if bevel:
        lib.bm_bevel(bm, bevel, segs)
    o = lib.bm_to_obj(name, bm, c, mat, smooth=True)
    lib.weighted_normals(o)
    return o


# ============================================================================ VCR
VCR_POS = Vector((0.005, -0.545, DESK_TOP))
VCR_W, VCR_H, VCR_D = 0.42, 0.098, 0.33
vcr = group('VCR', VCR_POS)
vparts = []
body = box('VCR_Body', (VCR_W, VCR_D, VCR_H - 0.008), (0, VCR_D / 2 + 0.004, 0.008 + (VCR_H - 0.008) / 2), C_STATIC,
           M['vcr'], bevel=0.004, weighted=False)
front = box('VCR_FrontPanel', (VCR_W - 0.006, 0.006, VCR_H - 0.016), (0, 0.002, 0.008 + (VCR_H - 0.008) / 2),
            C_STATIC, M['vcr_front'], bevel=0.002, weighted=False)
SLOT_X0, SLOT_X1, SLOT_Z0, SLOT_Z1 = -0.168, 0.042, 0.044, 0.08
for o in (body, front):
    bm = lib.bm_box(SLOT_X1 - SLOT_X0, 0.24, SLOT_Z1 - SLOT_Z0, center=((SLOT_X0 + SLOT_X1) / 2, 0.09,
                                                                           (SLOT_Z0 + SLOT_Z1) / 2))
    cutter = lib.bm_to_obj('cut', bm, C_STATIC, M['vcr_slot'], smooth=False)
    m = o.modifiers.new('bool', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.solver = 'EXACT'
    m.material_mode = 'TRANSFER'
    m.object = cutter
    lib.apply_mods(o)
    bpy.data.objects.remove(cutter)
    lib.weighted_normals(o)
parent([body, front], vcr)
# feet
for i, (x, y) in enumerate([(-0.18, 0.04), (0.18, 0.04), (-0.18, 0.29), (0.18, 0.29)]):
    parent([cylinder(f'VCR_Foot{i}', 0.014, 0.008, (x, y, 0), C_STATIC, M['rubber'], segs=16)], vcr)
# display window + buttons
disp_frame = box('VCR_DisplayBezel', (0.122, 0.003, 0.034), (0.135, -0.0015, 0.066), C_STATIC, M['vcr_slot'],
                 bevel=0.001)
parent([disp_frame], vcr)
disp = plane('VCR_Display', 0.114, 0.027, (0.135, -0.0032, 0.066), C_SCREEN, M['vfd'], rot=(R(90), 0, 0))
parent([disp], vcr)
for i, x in enumerate((0.085, 0.11, 0.135, 0.16, 0.185)):
    parent([box(f'VCR_Btn{i}', (0.019, 0.006, 0.0075), (x, -0.002, 0.032), C_STATIC,
                M['red'] if i == 4 else M['button_lt'], bevel=0.0015)], vcr)
parent([box('VCR_Power', (0.024, 0.006, 0.012), (-0.183, -0.002, 0.03), C_STATIC, M['button_lt'], bevel=0.002)], vcr)
parent([cylinder('VCR_PowerLED', 0.0018, 0.003, (-0.183, -0.003, 0.048), C_STATIC, M['led_red'],
                 rot=(R(90), 0, 0), segs=10)], vcr)
# slot interior back plate (dark) and the hinged door (dynamic)
parent([box('VCR_SlotBack', (SLOT_X1 - SLOT_X0, 0.004, SLOT_Z1 - SLOT_Z0), ((SLOT_X0 + SLOT_X1) / 2, 0.2,
                                                                              (SLOT_Z0 + SLOT_Z1) / 2), C_STATIC,
            M['vcr_slot'], bevel=0.0)], vcr)
door_pivot = group('VCR_Door', (VCR_POS.x + (SLOT_X0 + SLOT_X1) / 2, VCR_POS.y + 0.0, VCR_POS.z + SLOT_Z1 - 0.001),
                   c=C_DYN)
door = box('VCR_DoorPanel', (SLOT_X1 - SLOT_X0 - 0.004, 0.003, SLOT_Z1 - SLOT_Z0 - 0.003), (0, 0.0, -(SLOT_Z1 - SLOT_Z0) / 2),
           C_DYN, M['vcr_front'], bevel=0.001)
door_line = box('VCR_DoorTrim', (SLOT_X1 - SLOT_X0 - 0.03, 0.001, 0.0015), (0, -0.0018, -0.006), C_DYN, M['chrome'],
                bevel=0.0)
parent([door, door_line], door_pivot)
vdecal = plane('VCR_DecalTop', VCR_W - 0.02, 0.011, (0, -0.0011, 0.0875), C_DECAL, M['decal'], rot=(R(90), 0, 0))
vdecal2 = plane('VCR_DecalBottom', VCR_W - 0.02, 0.013, (0, -0.0011, 0.019), C_DECAL, M['decal'], rot=(R(90), 0, 0))
parent([vdecal, vdecal2], vcr)
# slot entry marker for the tape animation (centre of the slot mouth)
empty('VCR_SlotMouth', (VCR_POS.x + (SLOT_X0 + SLOT_X1) / 2, VCR_POS.y - 0.004, VCR_POS.z + SLOT_Z0 + 0.004))

# ============================================================================ CRT television
TV_POS = Vector((0.022, -0.505, DESK_TOP + VCR_H))
TV_W, TV_H, TV_D = 0.372, 0.37, 0.135
tv = group('TV', TV_POS)
SCR_ZC = 0.215
bm = lib.bm_box(TV_W, TV_D, TV_H, center=(0, TV_D / 2, TV_H / 2))
lib.bm_bevel(bm, 0.01, 4)
tvb = lib.bm_to_obj('TV_Body', bm, C_STATIC, M['tv'])
cutter = frustum_cutter('cut', 0.322, 0.25, 0.026, 0.298, 0.226, 0.018, -0.02, 0.034, SCR_ZC)
cutter.data.materials.append(M['tv_inner'])
m = tvb.modifiers.new('bool', 'BOOLEAN')
m.operation = 'DIFFERENCE'
m.solver = 'EXACT'
m.material_mode = 'TRANSFER'
m.object = cutter
lib.apply_mods(tvb)
bpy.data.objects.remove(cutter)
lib.weighted_normals(tvb)
# rear CRT housing
rear = hull('TV_Rear', [(sx * 0.165, TV_D - 0.002, z) for sx in (-1, 1) for z in (0.02, 0.34)] +
            [(sx * 0.1, 0.36, z) for sx in (-1, 1) for z in (0.06, 0.26)], C_STATIC, M['tv'], bevel=0.01)
scr = screen_mesh('TV_Screen', 0.302, 0.23, 0.02, 0.009, C_SCREEN, M['screen_tv'])
scr.location = (0, 0.0335, SCR_ZC)
parent([tvb, rear, scr], tv)
# control strip: power, 6 channel buttons, LED, 3 knobs
ctl = []
ctl.append(box('TV_PowerBtn', (0.026, 0.008, 0.016), (-0.148, -0.002, 0.048), C_STATIC, M['button'], bevel=0.002))
for i in range(6):
    ctl.append(box(f'TV_ChBtn{i}', (0.019, 0.007, 0.012), (-0.107 + i * 0.026, -0.0015, 0.044), C_STATIC,
                   M['button'], bevel=0.0018))
ctl.append(cylinder('TV_LED', 0.0022, 0.004, (-0.075, -0.0005, 0.067), C_STATIC, M['led_green'], rot=(R(90), 0, 0),
                    segs=12))
for i in range(3):
    x = 0.088 + i * 0.03
    ctl.append(cylinder(f'TV_Knob{i}', 0.0098, 0.014, (x, 0.004, 0.046), C_STATIC, M['knob'], rot=(R(90), 0, 0),
                        segs=28, bevel=0.0015))
    ctl.append(box(f'TV_KnobMark{i}', (0.0016, 0.001, 0.006), (x, -0.0103, 0.0505), C_STATIC, M['button_lt'],
                   bevel=0.0))
parent(ctl, tv)
# printed lettering: brand strip above the screen, legend strip under the controls
tdecal = plane('TV_DecalTop', TV_W - 0.03, 0.024, (0, -0.0006, 0.355), C_DECAL, M['decal'], rot=(R(90), 0, 0))
tdecal2 = plane('TV_DecalBottom', TV_W - 0.03, 0.016, (0, -0.0006, 0.024), C_DECAL, M['decal'], rot=(R(90), 0, 0))
parent([tdecal, tdecal2], tv)

# ============================================================================ VHS tape template (dynamic)
TAPE_L, TAPE_W, TAPE_H = 0.187, 0.103, 0.025
tape = group('Tape', (0, 0, -2.0), c=C_DYN)      # parked below the floor; instanced at runtime
shell = box('Tape_Shell', (TAPE_L, TAPE_W, TAPE_H), (0, 0, TAPE_H / 2), C_DYN, M['tape'], bevel=0.0018)
win = box('Tape_Window', (0.118, 0.034, 0.0012), (0, 0.016, TAPE_H + 0.0002), C_DYN, M['tape_window'], bevel=0.0004)
spine = plane('Tape_Spine', 0.168, 0.019, (0, -TAPE_W / 2 - 0.0003, TAPE_H / 2), C_DYN, M['label'], rot=(R(90), 0, 0))
toplabel = plane('Tape_TopLabel', 0.172, 0.036, (0, -0.026, TAPE_H + 0.0003), C_DYN, M['label'])
for i, x in enumerate((-0.043, 0.043)):
    cylinder(f'Tape_Spool{i}', 0.013, 0.0008, (x, 0.016, TAPE_H + 0.0006), C_DYN, M['label'], segs=24).parent = tape
parent([shell, win, spine, toplabel], tape)

# stack bases (helpers). Tape footprint rotated so the spine faces the camera (-Y)
empty('Stack_A', (0.372, -0.405, DESK_TOP), (0, 0, R(-2.5)))
empty('Stack_B', (0.588, -0.345, DESK_TOP), (0, 0, R(5)))
# shadow proxies for baking (stack heights match the default stack sizes in the web app)
for nm, loc, rot, n in (('StackProxy_A', (0.372, -0.405), -2.5, 4), ('StackProxy_B', (0.588, -0.345), 5, 5)):
    o = box(nm, (TAPE_L, TAPE_W, TAPE_H * n), (loc[0], loc[1], DESK_TOP + TAPE_H * n / 2), C_HELP, M['tape'],
            bevel=0.001, rot=(0, 0, R(rot)))
    lib.set_visibility(o, camera=False, diffuse=False, glossy=False, transmission=False)

# preview-only tape instances (the web app instantiates tapes from content)
C_PREV = coll('PREVIEW')
PREVIEW_COLORS = [(0.05, 0.42, 0.45), (0.85, 0.42, 0.08), (0.32, 0.12, 0.55), (0.03, 0.03, 0.03), (0.1, 0.12, 0.3),
                  (0.03, 0.03, 0.03), (0.6, 0.08, 0.1), (0.03, 0.03, 0.03), (0.2, 0.2, 0.2)]
prng = lib.rng(5)
k = 0
for base, n in (('Stack_A', 4), ('Stack_B', 5)):
    e = bpy.data.objects[base]
    for i in range(n):
        col = PREVIEW_COLORS[k % len(PREVIEW_COLORS)]
        mt = material(f'M_PrevTape{k}', color=col, rough=0.4)
        t = box(f'PrevTape{k}', (TAPE_L, TAPE_W, TAPE_H - 0.0006), (0, 0, 0), C_PREV, mt, bevel=0.0018)
        lab = plane(f'PrevTapeLabel{k}', 0.15, 0.017, (0, -TAPE_W / 2 - 0.0004, 0), C_PREV, M['label'], rot=(R(90), 0, 0))
        lab.parent = t
        t.location = e.location + Vector((prng.uniform(-0.004, 0.004), prng.uniform(-0.004, 0.004), TAPE_H * i + TAPE_H / 2))
        t.rotation_euler = (0, 0, e.rotation_euler.z + R(prng.uniform(-3, 3)))
        k += 1

# ============================================================================ legal pad (Work notepad, dynamic)
PAD_W, PAD_L, PAD_T = 0.216, 0.298, 0.011
pad = group('Notepad', (0.49, -0.6, DESK_TOP), (0, 0, R(74)), c=C_DYN)
p1 = box('Notepad_Stack', (PAD_W - 0.002, PAD_L - 0.03, PAD_T - 0.0015), (0, -0.016, (PAD_T - 0.0015) / 2), C_DYN,
         M['legal_edge'], bevel=0.0008)
p2 = box('Notepad_Binding', (PAD_W, 0.032, PAD_T + 0.0015), (0, PAD_L / 2 - 0.016, (PAD_T + 0.0015) / 2), C_DYN,
         M['binding'], bevel=0.0015)
p3 = plane('Notepad_Page', PAD_W - 0.003, PAD_L - 0.033, (0, -0.0165, PAD_T - 0.0012), C_DYN, M['legal'])
parent([p1, p2, p3], pad)

# ============================================================================ résumé printout (dynamic)
res = group('Resume', (0.80, -0.565, DESK_TOP + 0.0004), (0, 0, R(-9)), c=C_DYN)
r1 = box('Resume_Sheet2', (0.21, 0.297, 0.0006), (0.006, -0.004, 0.0003), C_DYN, M['paper'], bevel=0.0)
r2 = plane('Resume_Page', 0.21, 0.297, (0, 0, 0.0009), C_DYN, M['paper'])
parent([r1, r2], res)

# ============================================================================ desk lamp
LAMP = Vector((-0.53, -0.29, DESK_TOP))
lamp = group('Lamp', LAMP)
lp = []
lp.append(lathe('Lamp_Base', [(0, 0), (0.086, 0), (0.088, 0.003), (0.086, 0.012), (0.075, 0.02), (0.035, 0.026),
                              (0.012, 0.028), (0, 0.028)], C_STATIC, M['lamp'], segs=64))
lp.append(box('Lamp_Switch', (0.018, 0.012, 0.008), (0.0, -0.055, 0.022), C_STATIC, M['brass'], bevel=0.002,
              rot=(R(-12), 0, 0)))
SHADE_PIVOT = Vector((0.06, -0.1, 0.405))
stem = curve_tube('Lamp_Stem', [(0, 0.01, 0.026), (0, 0.012, 0.16), (0.0, 0.03, 0.31), (0.03, -0.03, 0.39),
                                tuple(SHADE_PIVOT + Vector((0, 0, 0.012)))], 0.0052, C_STATIC, M['brass'], res=16)
lp.append(stem)
lp.append(cylinder('Lamp_Collar', 0.0085, 0.02, (0, 0.01, 0.026), C_STATIC, M['brass'], segs=20))
# shade: cone opening downward, tilted toward the desk centre
shade_rot = Euler((R(-36), R(-24), 0), 'XYZ')   # opening faces down-right across the desk
outer = lathe('Lamp_Shade', [(0.021, 0.0), (0.03, -0.012), (0.06, -0.07), (0.088, -0.12), (0.0905, -0.124)],
              C_STATIC, M['lamp'], segs=72)
inner = lathe('Lamp_ShadeInner', [(0.0895, -0.1235), (0.087, -0.1195), (0.059, -0.0695), (0.029, -0.0115),
                                  (0.02, 0.0)], C_STATIC, M['lamp_inner'], segs=72)
cap = lathe('Lamp_ShadeCap', [(0.0, 0.006), (0.012, 0.005), (0.021, 0.0)], C_STATIC, M['lamp'], segs=48)
rim = curve_tube('Lamp_Rim', [(0.0905 * math.cos(a), 0.0905 * math.sin(a), -0.1245) for a in
                              [i * math.tau / 24 for i in range(24)]], 0.0016, C_STATIC, M['lamp'], closed=True)
bulb = lib.lathe('Lamp_Bulb', [(0.0, -0.075), (0.016, -0.07), (0.024, -0.055), (0.021, -0.035), (0.011, -0.02),
                               (0.0, -0.018)], C_STATIC, M['bulb'], segs=32)
sock = cylinder('Lamp_Socket', 0.013, 0.02, (0, 0, -0.022), C_STATIC, M['brass'], segs=24)
for o in (outer, inner, cap, rim, bulb, sock):
    o.location = SHADE_PIVOT
    o.rotation_euler = shade_rot
lp += [outer, inner, cap, rim, bulb, sock]
parent(lp, lamp)
bpy.context.view_layer.update()
bulb_world = lamp.matrix_world @ (SHADE_PIVOT + shade_rot.to_matrix() @ Vector((0, 0, -0.05)))
shade_dir = (shade_rot.to_matrix() @ Vector((0, 0, -1))).normalized()
empty('LampLight', bulb_world)
empty('LampAim', bulb_world + shade_dir * 0.5)
cable = curve_tube('Lamp_Cable', [tuple(LAMP + Vector((0, 0.07, 0.004))), tuple(LAMP + Vector((0.05, 0.2, 0.0035))),
                                  (LAMP.x + 0.02, -0.06, DESK_TOP + 0.003), (LAMP.x - 0.03, -0.035, DESK_TOP - 0.15),
                                  (LAMP.x - 0.06, -0.03, 0.25), (LAMP.x - 0.2, -0.03, 0.01)], 0.0024, C_STATIC,
                   M['cable'])

# ============================================================================ mug
MUG = Vector((-0.17, -0.62, DESK_TOP))
mug_prof = [(0.0, 0.0), (0.033, 0.0), (0.0385, 0.002), (0.0405, 0.008), (0.0415, 0.05), (0.042, 0.094),
            (0.0412, 0.0965), (0.0378, 0.0965), (0.037, 0.094), (0.0362, 0.05), (0.035, 0.012), (0.03, 0.0085),
            (0.0, 0.0085)]
mug = lathe('Mug', mug_prof, C_STATIC, M['ceramic'], segs=64, loc=MUG)
handle = curve_tube('Mug_Handle', [(-0.039, 0, 0.08), (-0.062, 0, 0.078), (-0.071, 0, 0.055), (-0.064, 0, 0.03),
                                   (-0.04, 0, 0.022)], 0.0058, C_STATIC, M['ceramic'], res=16)
handle.scale = (1, 0.75, 1)
handle.location = MUG
handle.rotation_euler = (0, 0, R(-30))
coffee = cylinder('Mug_Coffee', 0.0364, 0.001, (MUG.x, MUG.y, MUG.z + 0.079), C_STATIC, M['coffee'], segs=48)

# ============================================================================ CD player (Discman) + headphones
CD = Vector((-0.665, -0.715, DESK_TOP))
cdg = group('CDPlayer', CD, (0, 0, R(18)))
cdp = []
cdp.append(cylinder('CD_Body', 0.067, 0.022, (0, 0, 0), C_STATIC, M['discman'], segs=72, bevel=0.006))
cdp.append(cylinder('CD_Lid', 0.061, 0.004, (0, 0.0, 0.0215), C_STATIC, M['discman_lid'], segs=72, bevel=0.0015))
cdp.append(cylinder('CD_Hub', 0.011, 0.003, (0, 0, 0.0245), C_STATIC, M['chrome'], segs=32, bevel=0.0008))
cdp.append(box('CD_LCD', (0.034, 0.012, 0.0012), (0, -0.046, 0.0258), C_STATIC, M['lcd'], bevel=0.0004))
for i in range(5):
    a = R(-90 + (i - 2) * 13)
    cdp.append(box(f'CD_Btn{i}', (0.012, 0.004, 0.006), (0.0685 * math.cos(a), 0.0685 * math.sin(a), 0.011), C_STATIC,
                   M['button_lt'], bevel=0.0012, rot=(0, 0, a + R(90))))
cdp.append(box('CD_Jack', (0.006, 0.006, 0.006), (0.066, 0.012, 0.011), C_STATIC, M['chrome'], bevel=0.001))
parent(cdp, cdg)
cdl = plane('CD_Decal', 0.12, 0.12, (CD.x, CD.y, CD.z + 0.0262), C_DECAL, M['decal'], rot=(0, 0, R(18)))
# headphones: band arcs over the desk, cups lie flat
HP = Vector((-0.86, -0.64, DESK_TOP))
hpg = group('Headphones', HP, (0, 0, R(-62)))
hp = []
band = curve_tube('HP_Band', [(-0.072, 0.0, 0.022), (-0.06, 0.05, 0.016), (0.0, 0.078, 0.01), (0.06, 0.05, 0.016),
                              (0.072, 0.0, 0.022)], 0.0032, C_STATIC, M['steel'], res=14)
hp.append(band)
for i, sx in enumerate((-1, 1)):
    hp.append(cylinder(f'HP_Cup{i}', 0.027, 0.012, (sx * 0.074, -0.004, 0.0), C_STATIC, M['rubber'], segs=40,
                       bevel=0.003))
    hp.append(cylinder(f'HP_Foam{i}', 0.031, 0.016, (sx * 0.074, -0.004, 0.011), C_STATIC, M['foam'], segs=40,
                       bevel=0.006))
parent(hp, hpg)
hcable = curve_tube('HP_Cable', [tuple(HP + Vector((0.06, -0.03, 0.004))), tuple(HP + Vector((0.03, 0.04, 0.003))),
                                 tuple(CD + Vector((0.11, 0.06, 0.003))), tuple(CD + Vector((0.07, 0.03, 0.011)))],
                    0.0014, C_STATIC, M['cable'], res=20)

# ============================================================================ desk speakers (the Discman plays through them)
# Small walnut monitors either side of the TV, against the sill, toed in towards the chair. The cones are separate
# objects (they pulse with the music at runtime); 'SpeakerFront_*' empties give the web app each speaker's axis.
M['spk_wood'] = material('M_SpeakerWood', color=(0.52, 0.3, 0.17), rough=0.42, coat=0.35, coat_rough=0.12,
                         tex=T('teak_veneer', 'Diffuse', '2k'), nor=T('teak_veneer', 'nor_gl', '2k'), nor_strength=0.3)
M['spk_baffle'] = material('M_SpeakerBaffle', color=hexc('#141414'), rough=0.55)
M['spk_cone'] = material('M_SpeakerCone', color=hexc('#2b2a2a'), rough=0.85)
M['spk_cap'] = material('M_SpeakerCap', color=hexc('#8d8f94'), metal=0.8, rough=0.35)
M['spk_dome'] = material('M_SpeakerDome', color=hexc('#1d1d1f'), rough=0.3, coat=0.6, coat_rough=0.1)
M['spk_led'] = material('M_SpeakerLED', color=(0.9, 0.55, 0.1), rough=0.3, emission=(1.0, 0.55, 0.12), emission_strength=3)
SPK_W, SPK_D, SPK_H = 0.124, 0.13, 0.172
WOOF_Z, TWEET_Z = 0.066, 0.136
LISTENER = Vector((0.04, -1.67))


def speaker(side, x, y):
    toe = math.atan2(LISTENER.x - x, -(LISTENER.y - y))   # front (-Y) turned towards the listener
    g = group(f'Speaker_{side}', (x, y, DESK_TOP), (0, 0, toe))
    fy = -SPK_D / 2 - 0.004                                 # front face of the baffle (local)
    parts = [rounded_box(f'Spk{side}_Cab', (SPK_W, SPK_D, SPK_H), (0, 0, 0.004 + SPK_H / 2), C_STATIC, M['spk_wood'],
                         corner=0.008, axis=(0, 1, 0), bevel=0.003),
             box(f'Spk{side}_Baffle', (SPK_W - 0.01, 0.006, SPK_H - 0.012), (0, -SPK_D / 2 - 0.001, 0.004 + SPK_H / 2),
                 C_STATIC, M['spk_baffle'], bevel=0.002)]
    # woofer basket rim + rolled rubber surround (lathe +Z points out of the baffle, towards the room)
    parts.append(lathe(f'Spk{side}_WooferRim', [(0.05, 0.0), (0.05, 0.003), (0.0465, 0.0035), (0.0465, 0.0)], C_STATIC,
                       M['spk_baffle'], segs=64, loc=(0, fy, 0.004 + WOOF_Z), rot=(R(90), 0, 0)))
    parts.append(lathe(f'Spk{side}_Surround', [(0.0465, 0.001), (0.0445, 0.0045), (0.0405, 0.0057), (0.0365, 0.0049),
                                               (0.0345, 0.0042)], C_STATIC, M['rubber'], segs=64,
                       loc=(0, fy, 0.004 + WOOF_Z), rot=(R(90), 0, 0)))
    for k in range(4):
        a = R(45 + 90 * k)
        parts.append(cylinder(f'Spk{side}_Screw{k}', 0.0022, 0.002, (0.0482 * math.cos(a), fy, 0.004 + WOOF_Z + 0.0482 * math.sin(a)),
                              C_STATIC, M['chrome'], segs=12, rot=(R(90), 0, 0)))
    # tweeter: ring + small silk dome
    parts.append(lathe(f'Spk{side}_TweeterRing', [(0.019, 0.0), (0.0185, 0.0025), (0.0135, 0.003), (0.012, 0.0015)], C_STATIC,
                       M['spk_cap'], segs=48, loc=(0, fy, 0.004 + TWEET_Z), rot=(R(90), 0, 0)))
    parts.append(lathe(f'Spk{side}_TweeterDome', [(0.012, 0.0015), (0.011, 0.005), (0.007, 0.0085), (0.0, 0.0098)], C_STATIC,
                       M['spk_dome'], segs=40, loc=(0, fy, 0.004 + TWEET_Z), rot=(R(90), 0, 0)))
    parts.append(box(f'Spk{side}_Badge', (0.03, 0.002, 0.006), (0, fy - 0.0005, 0.004 + 0.022), C_STATIC, M['spk_cap'],
                     bevel=0.0006))
    for fx in (-1, 1):
        for fyy in (-1, 1):
            parts.append(cylinder(f'Spk{side}_Foot{fx}{fyy}', 0.007, 0.004, (fx * (SPK_W / 2 - 0.014), fyy * (SPK_D / 2 - 0.014), 0),
                                  C_STATIC, M['rubber'], segs=16))
    parts.append(box(f'Spk{side}_Terminal', (0.03, 0.006, 0.022), (0, SPK_D / 2 + 0.003, 0.004 + 0.03), C_STATIC,
                     M['button'], bevel=0.0015))
    parent(parts, g)
    # cone + dust cap: one moving part, not parented (so the join in bake_export.py leaves it separate)
    cone = lathe(f'Speaker_{side}_Cone', [(0.0352, 0.0044), (0.03, 0.0037), (0.02, 0.0023), (0.0122, 0.0012),
                                          (0.0118, 0.0016), (0.009, 0.0042), (0.0045, 0.0058), (0.0, 0.0062)],
                 C_STATIC, M['spk_cone'], segs=64)
    for i, poly in enumerate(cone.data.polygons):   # the dome in the middle is the metallic dust cap
        if sum((cone.data.vertices[v].co.xy.length for v in poly.vertices)) / len(poly.vertices) < 0.011:
            poly.material_index = 1
    cone.data.materials.append(M['spk_cap'])
    led = cylinder(f'Speaker_{side}_LED', 0.0021, 0.002, (SPK_W / 2 - 0.016, fy, 0.004 + 0.022), C_STATIC,
                   M['spk_led'], segs=12, rot=(R(90), 0, 0))
    cone.parent = g
    cone.location = (0, fy, 0.004 + WOOF_Z)
    cone.rotation_euler = (R(90), 0, 0)
    led.parent = g
    front = empty(f'SpeakerFront_{side}', (0, fy - 0.1, 0.004 + WOOF_Z), parent=g)
    bpy.context.view_layer.update()
    for o in (cone, led, front):
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    return g


speaker('L', -0.297, -0.125)
speaker('R', 0.34, -0.125)
# line out from the Discman to the left speaker, then behind the VCR to the right one
curve_tube('Spk_Cable', [tuple(CD + Vector((0.025, 0.07, 0.006))), (-0.64, -0.6, DESK_TOP + 0.003), (-0.637, -0.5, DESK_TOP + 0.003),
                         (-0.656, -0.36, DESK_TOP + 0.003), (-0.645, -0.17, DESK_TOP + 0.003), (-0.55, -0.075, DESK_TOP + 0.003),
                         (-0.37, -0.058, DESK_TOP + 0.004), (-0.3, -0.052, DESK_TOP + 0.03)], 0.0016, C_STATIC, M['cable'], res=24)
curve_tube('Spk_Cable2', [(-0.3, -0.052, DESK_TOP + 0.03), (-0.24, -0.062, DESK_TOP + 0.003), (0.02, -0.12, DESK_TOP + 0.003),
                          (0.26, -0.07, DESK_TOP + 0.003), (0.34, -0.052, DESK_TOP + 0.03)], 0.0016, C_STATIC, M['cable'], res=24)

# ============================================================================ remote, calculator, floppies


def keygrid(prefix, cols, rows, pitch, size, origin, c, mat, mat_alt=None, alt=()):
    out = []
    for r_ in range(rows):
        for c_ in range(cols):
            k = r_ * cols + c_
            out.append(box(f'{prefix}{k}', (size[0], size[1], size[2]),
                           (origin[0] + c_ * pitch[0], origin[1] + r_ * pitch[1], origin[2]), c,
                           mat_alt if k in alt else mat, bevel=min(size) * 0.3, segments=2, weighted=False))
    return out


RM = Vector((0.2, -0.665, DESK_TOP))
rmg = group('Remote', RM, (0, 0, R(-7)))
rm = [rounded_box('Remote_Body', (0.205, 0.052, 0.017), (0, 0, 0.0085), C_STATIC, M['remote'], corner=0.012,
                  bevel=0.003)]
rm += keygrid('Remote_Key', 7, 3, (0.022, 0.012, 0), (0.012, 0.007, 0.004), (-0.07, -0.012, 0.018), C_STATIC,
              M['button_lt'], M['red'], alt=(0,))
rm.append(box('Remote_IR', (0.004, 0.03, 0.01), (0.1015, 0, 0.0085), C_STATIC, M['vcr_front'], bevel=0.001))
parent(rm, rmg)
CA = Vector((-0.455, -0.47, DESK_TOP))
cag = group('Calculator', CA, (0, 0, R(14)))
ca = [rounded_box('Calc_Body', (0.088, 0.138, 0.011), (0, 0, 0.0055), C_STATIC, M['calc'], corner=0.006, bevel=0.002)]
ca.append(box('Calc_LCD', (0.07, 0.024, 0.0012), (0, 0.045, 0.0112), C_STATIC, M['lcd'], bevel=0.0004))
ca += keygrid('Calc_Key', 4, 5, (0.019, 0.017, 0), (0.014, 0.011, 0.0035), (-0.0285, -0.058, 0.012), C_STATIC,
              M['button_lt'], M['red'], alt=(3,))
parent(ca, cag)
for i, (dx, dy, rz, mat) in enumerate(((0.0, 0.0, 8, M['floppy_blue']), (0.012, 0.008, -6, M['floppy_black']))):
    fg = group(f'Floppy{i}', (0.765 + dx, -0.335 + dy, DESK_TOP + i * 0.0034), (0, 0, R(rz)))
    f = [box(f'Floppy{i}_Body', (0.09, 0.094, 0.0033), (0, 0, 0.00165), C_STATIC, mat, bevel=0.0008),
         box(f'Floppy{i}_Shutter', (0.048, 0.03, 0.0035), (0.004, 0.032, 0.00175), C_STATIC, M['chrome'], bevel=0.0004),
         box(f'Floppy{i}_Label', (0.07, 0.05, 0.0002), (0, -0.016, 0.0034), C_STATIC, M['paper'], bevel=0.0)]
    parent(f, fg)

# ============================================================================ imported CC0 props (Poly Haven)


def ph_model(asset, name, keep=None):
    root, meshes = lib.import_gltf(os.path.join(lib.PH, 'models', asset, asset + '.gltf'), C_STATIC, name, keep=keep)
    bpy.context.view_layer.update()
    for o in meshes:
        lib.apply_transform(o)
    bpy.data.objects.remove(root)
    return {o.name: o for o in meshes}


def place(o, loc, rot=(0, 0, 0), scale=1.0, anchor='bottom'):
    """Move a mesh so its local bbox anchor sits at loc (after rotation/scale)."""
    me = o.data
    me.transform(Matrix.Diagonal((scale, scale, scale, 1)))
    me.transform(Euler(rot, 'XYZ').to_matrix().to_4x4())
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    ax = (min(xs) + max(xs)) / 2
    ay = (min(ys) + max(ys)) / 2
    az = min(zs) if anchor == 'bottom' else (min(zs) + max(zs)) / 2
    me.transform(Matrix.Translation((-ax, -ay, -az)))
    o.location = loc
    return o


def place_group(objs, loc, rot=(0, 0, 0), scale=1.0):
    """Transform several meshes together (shared pivot = bbox bottom centre of all)."""
    for o in objs:
        o.data.transform(Matrix.Diagonal((scale, scale, scale, 1)))
        o.data.transform(Euler(rot, 'XYZ').to_matrix().to_4x4())
    pts = [v.co for o in objs for v in o.data.vertices]
    ax = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    ay = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    az = min(p.z for p in pts)
    for o in objs:
        o.data.transform(Matrix.Translation((-ax, -ay, -az)))
        o.location = loc


# plant (soil decimated: the source soil mesh is 54k faces)
pl = ph_model('potted_plant_02', 'Plant')
for nm, o in pl.items():
    if 'dirt' in nm:
        d = o.modifiers.new('dec', 'DECIMATE')
        d.ratio = 0.06
        lib.apply_mods(o)
plant_objs = list(pl.values())
for o in plant_objs:
    o.name = 'Plant_' + o.name.replace('potted_plant_02_', '').title()
place_group(plant_objs, (-0.83, -0.40, DESK_TOP), rot=(0, 0, R(205)), scale=0.66)

# stationery: pencil cup with pencils standing in it, eraser + red pen loose
st = ph_model('stationery_supplies', 'Stationery')
CUP = Vector((-0.69, -0.575, DESK_TOP))
for nm, o in st.items():
    short = nm.replace('stationery_supplies_', '')
    o.name = 'Stationery_' + short
    if short == 'pencilcup':
        place(o, CUP)
    elif short == 'eraser':
        place(o, (0.07, -0.72, DESK_TOP), rot=(0, 0, R(-25)))
    elif short == 'pen_red':
        place(o, (-0.47, -0.70, DESK_TOP + 0.0185), rot=(0, 0, R(76)))
    else:
        tilts = {'pen_blue': (8, 4), 'pen_fancy': (-10, 6), 'pencil_new_a': (5, -9), 'pencil_new_b': (-6, -5),
                 'pencil_old': (12, -2), 'pencil_used': (-3, 11)}
        tx, ty = tilts.get(short, (0, 0))
        off = {'pen_blue': (0.012, 0.01), 'pen_fancy': (-0.014, 0.008), 'pencil_new_a': (0.006, -0.015),
               'pencil_new_b': (-0.01, -0.01), 'pencil_old': (0.018, -0.004), 'pencil_used': (-0.004, 0.017)}
        ox, oy = off.get(short, (0, 0))
        place(o, (CUP.x + ox, CUP.y + oy, CUP.z + 0.006), rot=(R(tx), R(90 + ty), 0))

# sticky notes, white notes
npd = ph_model('office_notepads', 'Notepads', keep=['sticky_stack', 'note_stack', 'a4_stack'])
for nm, o in npd.items():
    short = nm.replace('office_notepads_', '')
    o.name = 'Notes_' + short
    if short == 'sticky_stack':
        place(o, (-0.31, -0.455, DESK_TOP), rot=(0, 0, R(11)))
    elif short == 'note_stack':   # moved forward: the left speaker stands where it used to be
        place(o, (-0.33, -0.305, DESK_TOP), rot=(0, 0, R(-4)))
    elif short == 'a4_stack':
        place(o, (-1.53, -1.42, SD_TOP), rot=(0, 0, R(8)))

# leather folio (open) at the front left
fo = ph_model('binder_notebook', 'Folio', keep=['binder_notebook'])
for nm, o in list(fo.items()):
    if 'closed' in nm:
        bpy.data.objects.remove(o)
        continue
    o.name = 'Folio'
    place(o, (-0.40, -0.69, DESK_TOP), rot=(0, 0, R(-6)))

# glasses, walkman + loose cassette, books, postcards
gl = ph_model('round_spectacles', 'Glasses')
for o in gl.values():
    o.name = 'Glasses'
    place(o, (-0.31, -0.665, DESK_TOP + 0.0185), rot=(0, 0, R(196)))
wk = ph_model('portable_cassette_player', 'Walkman')
wk_objs = []
for nm, o in wk.items():
    if 'casette' in nm:
        o.name = 'Cassette'
        place(o, (0.885, -0.43, DESK_TOP), rot=(R(-90), 0, R(-18)))
    else:
        o.name = 'Walkman_' + ('Lid' if 'lid' in nm else 'Body')
        wk_objs.append(o)
bk = ph_model('book_encyclopedia_set_01', 'Books')
stack = [('book01', 0.0, -6), ('book13', 0.0, 4), ('book15', 0.0, -2)]
z = DESK_TOP
for nm, o in list(bk.items()):
    short = nm.replace('book_encyclopedia_set_01_', '')
    if short not in [s[0] for s in stack]:
        bpy.data.objects.remove(o)
        continue
for short, _, rz in stack:
    o = bk['book_encyclopedia_set_01_' + short]
    o.name = 'Book_' + short
    place(o, (0.815, -0.155, z), rot=(0, R(90), R(rz)))
    z += max(v.co.z for v in o.data.vertices) - min(v.co.z for v in o.data.vertices)
place_group(wk_objs, (0.80, -0.16, z), rot=(R(-90), 0, R(-8)))
pc_cards = ph_model('postcard_set_01', 'Postcards')
rnd = lib.rng(11)
k = 0
for nm, o in sorted(pc_cards.items()):
    idx = int(nm.split('_')[-1])
    if idx > 12:
        bpy.data.objects.remove(o)
        continue
    col, row = (idx - 1) % 4, (idx - 1) // 4
    o.name = f'Postcard_{idx:02d}'
    place(o, (-1.7475 + 0.0005 * (k % 3), -1.58 + col * 0.182 + rnd.uniform(-0.01, 0.01),
              1.62 - row * 0.12 + rnd.uniform(-0.008, 0.008)),
          rot=(0, R(rnd.uniform(-3, 3)), R(-90)), anchor='center')
    k += 1

# fairy lights strung over the postcards: warm dots in the About view (L_Fairy does the actual lighting)
M['fairy'] = material('M_FairyBulb', color=(1.0, 0.82, 0.55), rough=0.3, emission=(1.0, 0.7, 0.38), emission_strength=8)
nails = [(-1.738, -1.74 + i * 0.29, 1.9 + (0.014 if i % 2 else 0.0)) for i in range(4)]
wire_pts, bulbs = [], []
for (ax, ay, az), (bx, by, bz) in zip(nails[:-1], nails[1:]):
    for s in range(10):
        t = s / 10
        p = (ax, ay + (by - ay) * t, az + (bz - az) * t - 0.07 * math.sin(math.pi * t))
        wire_pts.append(p)
        if s % 2 == 1:
            bulbs.append(p)
wire_pts.append(nails[-1])
curve_tube('Fairy_Wire', wire_pts, 0.0011, C_STATIC, M['cable'], res=3)
for i, (bx, by, bz) in enumerate(bulbs):
    lathe(f'Fairy_Bulb{i:02d}', [(0.0, -0.0085), (0.0045, -0.0068), (0.0062, -0.002), (0.0052, 0.003), (0.0025, 0.0062),
                                 (0.0, 0.007)], C_STATIC, M['fairy'], segs=10, loc=(bx + 0.007, by, bz - 0.011))

# ============================================================================ old computer on the side desk
PCG = group('Computer', (-1.45, -1.12, SD_TOP), (0, 0, R(90)))   # local -Y faces +X (into the room)
pcp = []
CW, CD_, CH = 0.4, 0.36, 0.115
pcp.append(box('PC_Case', (CW, CD_, CH), (0, 0, CH / 2), C_STATIC, M['beige'], bevel=0.006))
pcp.append(box('PC_DrivePanel', (0.17, 0.004, 0.05), (0.09, -CD_ / 2 - 0.001, 0.058), C_STATIC, M['beige_dk'],
               bevel=0.002))
pcp.append(box('PC_DriveSlot', (0.13, 0.003, 0.005), (0.09, -CD_ / 2 - 0.003, 0.066), C_STATIC, M['vcr_slot'],
               bevel=0.0))
pcp.append(box('PC_DriveLever', (0.02, 0.008, 0.012), (0.15, -CD_ / 2 - 0.004, 0.05), C_STATIC, M['beige_dk'],
               bevel=0.002))
pcp.append(box('PC_PowerSwitch', (0.022, 0.006, 0.02), (-0.15, -CD_ / 2 - 0.002, 0.05), C_STATIC, M['beige_dk'],
               bevel=0.002))
pcp.append(cylinder('PC_CaseLED', 0.002, 0.003, (-0.12, -CD_ / 2 - 0.0015, 0.05), C_STATIC, M['led_green'],
                    rot=(R(90), 0, 0), segs=10))
pcp.append(cylinder('PC_Swivel', 0.1, 0.018, (0, 0.01, CH), C_STATIC, M['beige_dk'], segs=48, bevel=0.003))
MON_Z = CH + 0.018
MW, MH, MD = 0.355, 0.305, 0.075
bm = lib.bm_box(MW, MD, MH, center=(0, -0.11 + MD / 2, MON_Z + MH / 2))
lib.bm_bevel(bm, 0.018, 5)
mon = lib.bm_to_obj('PC_MonitorFront', bm, C_STATIC, M['beige'])
PSZ = MON_Z + 0.172
cutter = frustum_cutter('cut', 0.29, 0.222, 0.03, 0.262, 0.196, 0.022, -0.11 - 0.02, -0.11 + 0.032, PSZ)
cutter.data.materials.append(M['beige_dk'])
m = mon.modifiers.new('bool', 'BOOLEAN')
m.operation = 'DIFFERENCE'
m.solver = 'EXACT'
m.material_mode = 'TRANSFER'
m.object = cutter
lib.apply_mods(mon)
bpy.data.objects.remove(cutter)
lib.weighted_normals(mon)
pcp.append(mon)
pcp.append(hull('PC_MonitorRear', [(sx * 0.15, -0.11 + MD - 0.002, z) for sx in (-1, 1) for z in (MON_Z + 0.02, MON_Z + 0.285)]
                + [(sx * 0.085, 0.17, z) for sx in (-1, 1) for z in (MON_Z + 0.06, MON_Z + 0.22)], C_STATIC, M['beige'],
                bevel=0.012))
pscr = screen_mesh('PC_Screen', 0.266, 0.2, 0.024, 0.008, C_SCREEN, M['screen_pc'])
pscr.location = (0, -0.11 + 0.031, PSZ)
pcp.append(pscr)
pcp.append(cylinder('PC_MonLED', 0.0025, 0.004, (0.1, -0.11 - 0.0005, MON_Z + 0.03), C_STATIC, M['led_green'],
                    rot=(R(90), 0, 0), segs=12))
pcp.append(box('PC_MonSwitch', (0.03, 0.01, 0.018), (0.135, -0.11 - 0.003, MON_Z + 0.03), C_STATIC, M['beige_dk'],
               bevel=0.003))
pdecal = plane('PC_Decal', MW - 0.05, 0.04, (0, -0.11 - 0.0012, MON_Z + 0.034), C_DECAL, M['decal'],
               rot=(R(90), 0, 0))
pcp.append(pdecal)
parent(pcp, PCG)
# keyboard in front (local -Y)
KBG = group('Keyboard', (-1.235, -1.1, SD_TOP), (0, 0, R(90 + 3)))
kb = [hull('KB_Body', [(sx * 0.215, y, z) for sx in (-1, 1) for y, z in ((-0.08, 0.0), (0.08, 0.0), (-0.08, 0.016),
                                                                           (0.08, 0.034))], C_STATIC, M['beige'],
           bevel=0.004)]
rows = [(13, 0.0), (13, 0.006), (12, 0.012), (11, 0.018)]
for r_, (n, xoff) in enumerate(rows):
    y = -0.05 + r_ * 0.024
    zt = 0.016 + (y + 0.08) / 0.16 * 0.018
    for c_ in range(n):
        x = -0.17 + xoff + c_ * 0.025
        kb.append(box(f'KB_Key{r_}_{c_}', (0.019, 0.019, 0.009), (x, y, zt + 0.003), C_STATIC,
                      M['keycap_dk'] if (c_ == 0 or c_ == n - 1) else M['keycap'], bevel=0.003, segments=2,
                      weighted=False, rot=(R(-6.5), 0, 0)))
kb.append(box('KB_Space', (0.15, 0.019, 0.009), (-0.01, -0.074, 0.016 + 0.003 + 0.0007), C_STATIC, M['keycap'],
              bevel=0.003, segments=2, weighted=False, rot=(R(-6.5), 0, 0)))
keys = lib.join(kb[1:], 'KB_Keys')
parent([kb[0], keys], KBG)
kbc = curve_tube('KB_Cable', [(-1.2, -0.98, SD_TOP + 0.01), (-1.25, -0.9, SD_TOP + 0.004), (-1.42, -0.9, SD_TOP + 0.004),
                              (-1.5, -0.98, SD_TOP + 0.03)], 0.0025, C_STATIC, M['cable'])

# ============================================================================ teak chair at the computer (the avatar sits here)
CHAIR = Vector((-0.865, -1.11, 0.0))
SEAT_H = 0.445
chg = group('Chair', CHAIR, (0, 0, R(-90 - 5)))   # local -Y (the front) faces the side desk; backrest towards the room
ch = [rounded_box('Chair_Seat', (0.43, 0.42, 0.034), (0, 0, SEAT_H - 0.017), C_STATIC, M['teak'], corner=0.035, bevel=0.005)]
for i, (lx, ly) in enumerate(((-0.18, -0.17), (0.18, -0.17), (-0.18, 0.175), (0.18, 0.175))):
    hgt = SEAT_H - 0.034 if ly < 0 else 0.905      # back legs run up into the backrest
    ch.append(box(f'Chair_Leg{i}', (0.034, 0.034, hgt), (lx, ly, hgt / 2), C_STATIC, M['teak'], bevel=0.005))
ch.append(box('Chair_TopRail', (0.37, 0.026, 0.095), (0, 0.178, 0.835), C_STATIC, M['teak'], bevel=0.008))
ch.append(box('Chair_BackSlat', (0.34, 0.018, 0.055), (0, 0.178, 0.665), C_STATIC, M['teak'], bevel=0.005))
CHAIR_RAILS = [((0.34, 0.022, 0.05), (0, -0.17, 0.39)), ((0.34, 0.022, 0.05), (0, 0.175, 0.39)),
               ((0.022, 0.33, 0.05), (-0.18, 0.0, 0.39)), ((0.022, 0.33, 0.05), (0.18, 0.0, 0.39)),
               ((0.34, 0.02, 0.025), (0, -0.17, 0.13)), ((0.34, 0.02, 0.025), (0, 0.175, 0.13))]
for i, (sz, loc) in enumerate(CHAIR_RAILS):
    ch.append(box(f'Chair_Rail{i}', sz, loc, C_STATIC, M['teak'], bevel=0.004))
parent(ch, chg)

# Indian modular switch board on the left wall above the computer (in frame in both About views). The second
# rocker works the tube light: it stays a separate object ('Switch_Light') so the web app can flip it.
swg = group('SwitchBoard', (-1.749, -0.85, 1.2), (0, 0, R(90)))   # local -Y (the rockers) faces into the room
sw = [box('Switch_Plate', (0.2, 0.01, 0.095), (0, -0.005, 0), C_STATIC, M['switchboard'], bevel=0.003)]
for i in (0, 2, 3):
    sw.append(box(f'Switch_Rocker{i}', (0.024, 0.008, 0.04), (-0.06 + i * 0.03, -0.013, 0.008), C_STATIC,
                  M['switchboard'], bevel=0.003, rot=(R(6 if i % 2 else -6), 0, 0)))
sw.append(box('Switch_Socket', (0.03, 0.006, 0.03), (0.075, -0.012, 0.0), C_STATIC, M['button_lt'], bevel=0.004))
parent(sw, swg)
rocker = box('Switch_Light', (0.024, 0.008, 0.04), (-0.03, -0.013, 0.008), C_STATIC, M['switchboard'], bevel=0.003,
             rot=(R(-6), 0, 0))   # -6° = off (top pressed in)
rocker.parent = swg
bpy.context.view_layer.update()
_mw = rocker.matrix_world.copy()
rocker.parent = None
rocker.matrix_world = _mw

# 4-ft LED tube light high on the left wall above the side desk (off by default; the switch below turns it on)
M['tube_body'] = material('M_TubeBatten', color=hexc('#e9e7e1'), rough=0.4)
M['tube_light'] = material('M_TubeLight', color=(0.92, 0.95, 1.0), rough=0.3, emission=(0.9, 0.95, 1.0), emission_strength=12)
TUBE = Vector((-1.75, -1.15, 2.12))
box('Tube_Batten', (0.026, 1.24, 0.036), (TUBE.x + 0.013, TUBE.y, TUBE.z), C_STATIC, M['tube_body'], bevel=0.004)
cylinder('Tube_Diffuser', 0.0125, 1.2, (TUBE.x + 0.03, TUBE.y, TUBE.z - 0.008), C_STATIC, M['tube_light'], segs=20,
         rot=(R(90), 0, 0), bottom=False)
empty('TubeLightPos', (TUBE.x + 0.06, TUBE.y, TUBE.z - 0.02))

# ============================================================================ poster (window wall, right)
POSTER = (1.165, -0.004, 1.42)   # A3-ish, so the whole 'ME' poster sits inside the overview frame
pg = plane('Poster', 0.36, 0.496, POSTER, C_DECAL, M['poster'], rot=(R(90), 0, 0), subdiv=8)
# paper is never perfectly flat
for v in pg.data.vertices:
    v.co.z += 0.0025 * math.sin(v.co.x * 9 + 1) * math.sin(v.co.y * 7)
for i, (dx, dz, rz) in enumerate(((-0.17, 0.238, 40), (0.17, 0.238, -40), (-0.17, -0.238, -40), (0.17, -0.238, 40))):
    plane(f'Poster_Tape{i}', 0.06, 0.022, (POSTER[0] + dx, POSTER[1] - 0.0015, POSTER[2] + dz), C_STATIC,
          M['tape_clear'], rot=(R(90), R(rz), 0))

# ============================================================================ exterior placeholder (preview only)
ext = plane('City_Backdrop', 60, 30, (0, 14, 6), C_EXT,
            material('M_CityPlaceholder', color=(0.0, 0.0, 0.0), emission=(0.08, 0.1, 0.18), emission_strength=1.0),
            rot=(R(90), 0, 0))

for o in C_DECAL.objects:
    if o.name != 'Poster':
        lib.set_visibility(o, camera=False, shadow=False, diffuse=False, glossy=False, transmission=False)

# ============================================================================ lights
LIGHTS = coll('LIGHTS')


def add_light(name, kind, loc, energy, color, rot=(0, 0, 0), size=0.1, size_y=None, spot=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.shape = 'RECTANGLE'
        ld.size = size
        ld.size_y = size_y or size
    elif kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = size
    if kind == 'SPOT' and spot:
        ld.spot_size, ld.spot_blend = spot
    o = bpy.data.objects.new(name, ld)
    LIGHTS.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    return o


add_light('L_Lamp', 'POINT', bulb_world, 40.0, (1.0, 0.64, 0.34), size=0.018)
# cool night light coming through the glass
add_light('L_Window', 'AREA', (WCX, 0.07, 1.64), 3.0, (0.6, 0.7, 1.0), rot=(R(-90), 0, 0), size=1.5, size_y=1.4)
# warm room light from behind the viewer (out of frame)
add_light('L_Room', 'AREA', (0.35, -2.9, 2.5), 15.0, (1.0, 0.6, 0.34), rot=(R(58), 0, 0), size=1.4, size_y=0.9)
add_light('L_RoomLeft', 'AREA', (-1.2, -2.2, 2.4), 4.0, (1.0, 0.6, 0.34), rot=(R(50), 0, R(-30)), size=0.8)
add_light('L_Corner', 'AREA', (-0.95, -1.15, 2.2), 12.0, (1.0, 0.62, 0.36), rot=(0, R(32), 0), size=0.5)   # computer + wall
# warm wash behind the fairy lights, so the wall around the computer isn't a black void in the About view
add_light('L_Fairy', 'AREA', (-1.45, -1.25, 1.72), 6.0, (1.0, 0.68, 0.38), rot=(0, R(90), 0), size=0.25, size_y=1.0)   # faces the wall
# the wall tube light (its own bake layer: the switch fades it in at runtime); faces into the room, a little down
add_light('L_Tube', 'AREA', (-1.69, -1.15, 2.1), 30.0, (0.92, 0.96, 1.0), rot=(0, R(-75), 0), size=0.06, size_y=1.2)

world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.004, 0.005, 0.009, 1)
bg.inputs['Strength'].default_value = 1.0

# ============================================================================ cameras from shots.json
for key, s in SHOTS.items():
    if key.startswith('_') or key == 'mobile':
        continue
    cd = bpy.data.cameras.new('CAM_' + key)
    cd.sensor_fit = 'VERTICAL'
    cd.angle = R(s['fov'])
    cd.clip_start = 0.02
    co = bpy.data.objects.new('CAM_' + key, cd)
    C_HELP.objects.link(co)
    co.location = b3(s['pos'])
    d = (b3(s['target']) - b3(s['pos'])).normalized()
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
scene.camera = bpy.data.objects['CAM_overview']

# ============================================================================ helpers for runtime
empty('TVGlow', TV_POS + Vector((0, -0.01, SCR_ZC)))
empty('ResumeHome', res.location.copy())
empty('NotepadHome', pad.location.copy())

out_dir = os.path.join(lib.ROOT, 'assets-src', 'blend')
os.makedirs(out_dir, exist_ok=True)
path = os.path.join(out_dir, 'room.blend')
bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
tris = sum(len(o.data.loop_triangles) if (o.data.calc_loop_triangles() or True) else 0
           for o in bpy.data.objects if o.type == 'MESH')
print('SAVED', path, 'objects', len(bpy.data.objects), 'tris', tris)
