"""Shared helpers for the Blender build scripts (Blender 5.x, run in background mode).

Conventions
- Blender world: X right, Y towards the window (into the scene), Z up. Metres.
- The window wall's interior face is the plane Y = 0; the room is Y < 0.
- glTF export converts to three.js Y-up: (x, y, z)_blender -> (x, z, -y)_three.
"""
import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PH = os.path.join(ROOT, 'assets-src', 'polyhaven')
GEN = os.path.join(ROOT, 'assets-src', 'generated')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def move_to(obj, c):
    for uc in list(obj.users_collection):
        uc.objects.unlink(obj)
    c.objects.link(obj)


# --------------------------------------------------------------------------- mesh building

def bm_to_obj(name, bm, c, mat=None, smooth=True, loc=(0, 0, 0), rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    if mat is not None:
        assign(o, mat)
    return o


def assign(o, *mats):
    o.data.materials.clear()
    for m in mats:
        o.data.materials.append(m)


def bm_box(sx, sy, sz, center=(0, 0, 0), bottom=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    cx, cy, cz = center
    for v in bm.verts:
        v.co.x = v.co.x * sx + cx
        v.co.y = v.co.y * sy + cy
        v.co.z = v.co.z * sz + cz + (sz / 2 if bottom else 0)
    return bm


def bm_bevel(bm, width, segments=3, edges=None, profile=0.5):
    edges = edges if edges is not None else list(bm.edges)
    if width <= 0 or not edges:
        return bm
    bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type='OFFSET', segments=segments,
                    profile=profile, affect='EDGES', clamp_overlap=True)
    return bm


def edges_parallel(bm, axis, tol=0.999):
    a = Vector(axis).normalized()
    out = []
    for e in bm.edges:
        d = (e.verts[1].co - e.verts[0].co)
        if d.length > 1e-9 and abs(d.normalized().dot(a)) > tol:
            out.append(e)
    return out


def box(name, size, loc, c, mat=None, bevel=0.002, segments=3, rot=(0, 0, 0), bottom=False, weighted=True):
    """Bevelled box. `loc` is the centre (or bottom-centre if bottom=True)."""
    bm = bm_box(*size, bottom=bottom)
    bm_bevel(bm, bevel, segments)
    o = bm_to_obj(name, bm, c, mat, smooth=True, loc=loc, rot=rot)
    if weighted:
        weighted_normals(o)
    return o


def rounded_box(name, size, loc, c, mat=None, corner=0.01, axis=(0, 0, 1), bevel=0.002, rot=(0, 0, 0),
                bottom=False):
    """Box with rounded corners around `axis`, plus a small overall bevel."""
    bm = bm_box(*size, bottom=bottom)
    bm_bevel(bm, corner, segments=6, edges=edges_parallel(bm, axis))
    if bevel > 0:
        bm_bevel(bm, bevel, segments=2, edges=[e for e in bm.edges if e.calc_face_angle(0) > math.radians(50)])
    o = bm_to_obj(name, bm, c, mat, smooth=True, loc=loc, rot=rot)
    weighted_normals(o)
    return o


def cylinder(name, r, h, loc, c, mat=None, segs=48, bevel=0.0, rot=(0, 0, 0), r2=None, bottom=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r2 is None else r2, depth=h)
    if bottom:
        for v in bm.verts:
            v.co.z += h / 2
    if bevel > 0:
        bm_bevel(bm, bevel, 2, edges=[e for e in bm.edges if e.calc_face_angle(0) > math.radians(60)])
    o = bm_to_obj(name, bm, c, mat, smooth=True, loc=loc, rot=rot)
    weighted_normals(o)
    return o


def lathe(name, profile, c, mat=None, segs=64, loc=(0, 0, 0), rot=(0, 0, 0), close_top=False):
    """Revolve a list of (radius, z) points around Z."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segs,
                   use_merge=True, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_to_obj(name, bm, c, mat, smooth=True, loc=loc, rot=rot)


def plane(name, sx, sy, loc, c, mat=None, rot=(0, 0, 0), subdiv=0):
    """XY plane centred on loc, UV 0..1 (u along X, v along Y)."""
    bm = bmesh.new()
    nx = ny = max(1, subdiv + 1)
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            row.append(bm.verts.new(((i / nx - 0.5) * sx, (j / ny - 0.5) * sy, 0)))
        grid.append(row)
    uv = bm.loops.layers.uv.new('UVMap')
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for l, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                l[uv].uv = (a / nx, b / ny)
    return bm_to_obj(name, bm, c, mat, smooth=False, loc=loc, rot=rot)


def curve_tube(name, points, radius, c, mat=None, res=10, bevel_res=4, closed=False, taper=None):
    cu = bpy.data.curves.new(name + '_cu', 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u = res
    cu.bevel_depth = radius
    cu.bevel_resolution = bevel_res
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sp.use_cyclic_u = closed
    tmp = bpy.data.objects.new(name + '_tmp', cu)
    c.objects.link(tmp)
    o = to_mesh(tmp, name, c)
    if mat is not None:
        assign(o, mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def to_mesh(src, name, c):
    """Evaluate modifiers/curves of src into a new mesh object; removes src."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = src.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    me.name = name
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    o.matrix_world = src.matrix_world.copy()
    data = src.data
    bpy.data.objects.remove(src)
    if isinstance(data, bpy.types.Curve):
        bpy.data.curves.remove(data)
    return o


def apply_mods(o):
    """Bake all modifiers into the mesh data (no operators needed)."""
    if not o.modifiers:
        return o
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = o.data
    o.modifiers.clear()
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return o


def boolean_diff(o, cutter):
    m = o.modifiers.new('bool', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.solver = 'EXACT'
    m.object = cutter
    apply_mods(o)
    bpy.data.objects.remove(cutter)
    return o


def weighted_normals(o):
    m = o.modifiers.new('wn', 'WEIGHTED_NORMAL')
    m.mode = 'FACE_AREA'
    m.weight = 50
    m.keep_sharp = True
    return o


def join(objs, name):
    """Join objects into the first one (keeps materials)."""
    objs = [o for o in objs if o is not None]
    for o in objs:
        apply_mods(o)
    base = objs[0]
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        remap = {}
        for i, m in enumerate(o.data.materials):
            if m not in mats:
                mats.append(m)
            remap[i] = mats.index(m)
        for p in me.polygons:
            p.material_index = remap.get(p.material_index, 0)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    c = base.users_collection[0]
    for o in objs:
        bpy.data.objects.remove(o)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    for m in mats:
        me.materials.append(m)
    # bmesh drops custom split normals: recompute them (flat faces stay flat next to bevels)
    weighted_normals(o)
    return o


# --------------------------------------------------------------------------- UVs

def uv_box(o, scale=1.0, world=True, rot90_axes=()):
    """Box-project UVs (1 UV unit = 1/scale metres). Grain runs along the face's first axis."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
    mw = o.matrix_world if world else Matrix.Identity(4)
    n_mat = mw.to_3x3().inverted().transposed()
    for f in bm.faces:
        n = (n_mat @ f.normal).normalized()
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = mw @ l.vert.co
            if ax == 2:
                u, v = p.x, p.y
            elif ax == 1:
                u, v = p.x, p.z
            else:
                u, v = p.y, p.z
            if ax in rot90_axes:
                u, v = v, u
            l[uv].uv = (u * scale, v * scale)
    bm.to_mesh(me)
    bm.free()


def uv_planar(o, axis='Z', bounds=None):
    """Planar 0..1 UVs over the object's local bounds (for screens/labels)."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
    i, j = {'Z': (0, 1), 'Y': (0, 2), 'X': (1, 2), '-Y': (0, 2)}[axis]
    xs = [v.co[i] for v in bm.verts]
    ys = [v.co[j] for v in bm.verts]
    x0, x1, y0, y1 = bounds or (min(xs), max(xs), min(ys), max(ys))
    for f in bm.faces:
        for l in f.loops:
            u = (l.vert.co[i] - x0) / (x1 - x0)
            v = (l.vert.co[j] - y0) / (y1 - y0)
            if axis == '-Y':
                u = 1 - u
            l[uv].uv = (u, v)
    bm.to_mesh(me)
    bm.free()


# --------------------------------------------------------------------------- materials

_img_cache = {}


def image(path, colorspace='sRGB'):
    key = (path, colorspace)
    if key in _img_cache:
        return _img_cache[key]
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    _img_cache[key] = img
    return img


def ph_tex(asset, kind, res='1k'):
    d = os.path.join(PH, 'textures', asset)
    for ext in ('jpg', 'png'):
        p = os.path.join(d, f'{asset}_{kind}_{res}.{ext}')
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f'{asset} {kind} {res}')


def material(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, coat=0.0, coat_rough=0.05,
             spec=0.5, emission=None, emission_strength=0.0, alpha=1.0, transmission=0.0, ior=1.5,
             tex=None, nor=None, rough_tex=None, nor_strength=1.0, rough_mul=1.0, sheen=0.0,
             subsurface=0.0, translucent=0.0, tex_srgb=True):
    """Principled material. Image inputs use the 'UVMap' layer; tiling is baked into the UVs."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    out.location = (500, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.location = (150, 0)
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Specular IOR Level'].default_value = spec
    b.inputs['IOR'].default_value = ior
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = coat_rough
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen
    if subsurface:
        b.inputs['Subsurface Weight'].default_value = subsurface
    if transmission:
        b.inputs['Transmission Weight'].default_value = transmission
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
    if emission is not None:
        b.inputs['Emission Color'].default_value = (*emission, 1.0)
        b.inputs['Emission Strength'].default_value = emission_strength
    y = 300
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = image(tex, 'sRGB' if tex_srgb else 'Non-Color')
        t.location = (-500, y)
        y -= 300
        if color != (0.8, 0.8, 0.8) and color != (1, 1, 1):
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            mix.inputs[7].default_value = (*color, 1.0)
            mix.location = (-150, 300)
            nt.links.new(t.outputs['Color'], mix.inputs[6])
            nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        else:
            nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if rough_tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = image(rough_tex, 'Non-Color')
        t.location = (-500, y)
        y -= 300
        if rough_mul != 1.0:
            mm = nt.nodes.new('ShaderNodeMath')
            mm.operation = 'MULTIPLY'
            mm.inputs[1].default_value = rough_mul
            mm.use_clamp = True
            nt.links.new(t.outputs['Color'], mm.inputs[0])
            nt.links.new(mm.outputs[0], b.inputs['Roughness'])
        else:
            nt.links.new(t.outputs['Color'], b.inputs['Roughness'])
    if nor:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = image(nor, 'Non-Color')
        t.location = (-500, y)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = nor_strength
        nm.location = (-150, y)
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if alpha < 1.0:
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    return m


def set_visibility(o, camera=True, shadow=True, diffuse=True, glossy=True, transmission=True):
    o.visible_camera = camera
    o.visible_shadow = shadow
    o.visible_diffuse = diffuse
    o.visible_glossy = glossy
    o.visible_transmission = transmission


# --------------------------------------------------------------------------- imports

def import_gltf(path, c, name, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, keep=None):
    """Import a glTF, move its meshes into `c`, parent them to an empty named `name`."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name, None)
    c.objects.link(root)
    meshes = []
    for o in new:
        if o.type != 'MESH':
            continue
        if keep and not any(k in o.name for k in keep):
            continue
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        move_to(o, c)
        meshes.append(o)
    for o in new:
        if o not in meshes:
            bpy.data.objects.remove(o)
    for o in meshes:
        o.parent = root
    root.location = loc
    root.rotation_euler = rot
    root.scale = (scale, scale, scale)
    return root, meshes


def bake_parent(root):
    """Apply the parent transform into children world matrices and drop the empty."""
    bpy.context.view_layer.update()
    kids = list(root.children)
    for k in kids:
        mw = k.matrix_world.copy()
        k.parent = None
        k.matrix_world = mw
    bpy.data.objects.remove(root)
    return kids


def apply_transform(o):
    """Freeze object transform into mesh data."""
    me = o.data
    me.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)


def dims(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(b) for o in objs for b in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def rng(seed):
    return random.Random(seed)
