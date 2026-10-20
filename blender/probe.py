"""Prints API facts and imported asset dimensions. Run: blender -b --factory-startup -P blender/probe.py"""
import bpy, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import lib

lib.reset()
print('VERSION', bpy.app.version_string)
print('ENGINES', [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items])
prefs = bpy.context.preferences.addons['cycles'].preferences
for t in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = t
        prefs.get_devices()
        print('DEVICES', t, [(d.name, d.type) for d in prefs.devices])
    except Exception as e:
        print('no', t, e)
c = lib.coll('probe')
for a in ['potted_plant_02', 'round_spectacles', 'stationery_supplies', 'office_notepads', 'binder_notebook',
          'portable_cassette_player', 'book_encyclopedia_set_01', 'postcard_set_01']:
    root, meshes = lib.import_gltf(os.path.join(lib.PH, 'models', a, a + '.gltf'), c, a)
    lo, hi = lib.dims(meshes)
    print('ASSET', a, 'size', tuple(round(x, 3) for x in (hi - lo)), 'lo', tuple(round(x, 3) for x in lo))
    for o in meshes:
        lo2, hi2 = lib.dims([o])
        print('   ', o.name, len(o.data.polygons), 'faces', tuple(round(x, 3) for x in (hi2 - lo2)),
              'center', tuple(round(x, 3) for x in (lo2 + hi2) / 2), [m.name for m in o.data.materials])
