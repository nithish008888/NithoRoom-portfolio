"""Seats the owner's character (assets-src/nitho_articulation_v2.glb) on the teak chair at the computer, typing.

blender -b assets-src/blend/room.blend --python-exit-code 1 -P blender/pose_character.py -- [--preview <dir>]

Outputs
  assets-src/generated/nitho_raw.glb   posed, still skinned (blink/breathing at runtime); optimised to public/models/nitho.glb
  assets-src/blend/nitho_posed.blend   the posed character only; bake_export.py appends it as a shadow caster
With --preview it also renders a few EEVEE checks of the pose and the About framing into <dir>.
"""
import bpy
import json
import math
import os
import sys
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(__file__))
import lib  # noqa: E402

R = math.radians
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
SRC = os.path.join(lib.ROOT, 'assets-src', 'nitho_articulation_v2.glb')
CHAIR = Vector((-0.865, -1.11, 0.0))          # keep in sync with build_scene.py
CHAIR_YAW = R(-90 - 5)
SEAT_H = 0.445

room_objects = set(bpy.data.objects)
C_CHAR = lib.coll('CHARACTER')
bpy.ops.import_scene.gltf(filepath=SRC)
char_objs = [o for o in bpy.data.objects if o not in room_objects]
for o in char_objs:
    for c in list(o.users_collection):
        c.objects.unlink(o)
    C_CHAR.objects.link(o)
arm = next(o for o in char_objs if o.type == 'ARMATURE')
for o in char_objs:   # the importer adds a helper icosphere for bone shapes
    if o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o)
char_objs = [o for o in bpy.data.objects if o not in room_objects]
arm.rotation_mode = 'XYZ'   # the glTF importer leaves objects in quaternion mode
arm.location = (0, 0, 0)
arm.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()


def aim(name, d, twist=0.0):
    """Rotate a pose bone so it points along world direction d (character frame: facing -Y, left = +X, up = +Z)."""
    pb = arm.pose.bones[name]
    bpy.context.view_layer.update()
    m3 = (arm.matrix_world @ pb.matrix).to_3x3().normalized()
    cur = (m3 @ Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(Vector(d).normalized())
    local = (m3.inverted() @ q.to_matrix() @ m3).to_quaternion()
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = pb.rotation_quaternion @ local
    if twist:
        pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion((0, 1, 0), twist)


def bend(name, angle, axis=(1, 0, 0)):
    pb = arm.pose.bones[name]
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(axis, angle)


POSE = json.load(open(os.path.join(os.path.dirname(__file__), 'nitho_pose.json')))
for name, spec in POSE['aim']:
    if name in arm.pose.bones:
        aim(name, spec[:3], R(spec[3]) if len(spec) > 3 else 0.0)
for name, ang, axis in POSE['bend']:
    if name in arm.pose.bones:
        bend(name, R(ang), axis)
bpy.context.view_layer.update()

# sit: hip joint ~9 cm above the seat, a little towards the backrest; face the side desk like the chair
hips = arm.matrix_world @ arm.pose.bones['Hips'].head
rot = Matrix.Rotation(CHAIR_YAW, 4, 'Z')
back = (rot @ Vector((0, 1, 0, 0))).xyz
target = CHAIR + back * POSE.get('seat_back', 0.045) + Vector((0, 0, SEAT_H + POSE.get('hip_above_seat', 0.09)))
arm.rotation_euler = (0, 0, CHAIR_YAW)
arm.location = target - (rot.to_3x3() @ hips)
bpy.context.view_layer.update()
for b in ('Hand.L', 'Hand.R', 'Head', 'Foot.L', 'Foot.R'):
    pb = arm.pose.bones[b]
    print('POSED', b, tuple(round(v, 3) for v in (arm.matrix_world @ pb.head)), '->',
          tuple(round(v, 3) for v in (arm.matrix_world @ pb.tail)))

# ----------------------------------------------------------------------------- outputs
os.makedirs(lib.GEN, exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for o in char_objs:
    o.hide_set(False)
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
glb = os.path.join(lib.GEN, 'nitho_raw.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=False,
                          export_skins=True, export_morph=True, export_animations=False, export_rest_position_armature=False,
                          export_yup=True, export_cameras=False, export_lights=False, export_extras=True)
print('EXPORTED', glb, os.path.getsize(glb) // 1024, 'KB')
lib_path = os.path.join(lib.ROOT, 'assets-src', 'blend', 'nitho_posed.blend')
bpy.data.libraries.write(lib_path, set(char_objs), compress=True)
print('WROTE', lib_path)

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 960, 600
    sc.view_settings.view_transform = 'AgX'
    for cname in ('EXTERIOR', 'PREVIEW'):
        c = bpy.data.collections.get(cname)
        if c:
            for o in c.all_objects:
                o.hide_render = True
    key = bpy.data.lights.new('pv_key', 'AREA')
    key.energy, key.size, key.color = 60, 1.2, (1.0, 0.85, 0.7)
    ko = bpy.data.objects.new('pv_key', key)
    sc.collection.objects.link(ko)
    ko.location = (-0.3, -0.7, 2.3)
    ko.rotation_euler = (Vector((-0.9, -1.1, 0.9)) - ko.location).to_track_quat('-Z', 'Y').to_euler()
    cam_d = bpy.data.cameras.new('pv_cam')
    cam = bpy.data.objects.new('pv_cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    screen = Vector((-1.371, -1.12, 1.045))
    for name, pos, look, fov in POSE.get('preview_cams', []):
        cam.location = Vector(pos)
        cam.rotation_euler = (Vector(look or screen) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam_d.angle_y = R(fov)
        cam_d.sensor_fit = 'VERTICAL'
        hide = name.startswith('xray')
        for nm in ('Wall_Left',):
            o = bpy.data.objects.get(nm)
            if o:
                o.hide_render = hide
        sc.render.filepath = os.path.join(PREVIEW, f'pose_{name}.png')
        bpy.ops.render.render(write_still=True)
    print('PREVIEWS', PREVIEW)
