"""Render a quick Cycles preview of room.blend from one of the shot cameras.

blender -b assets-src/blend/room.blend -P blender/preview.py -- <camera> <out.png> [width] [samples]
"""
import bpy
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
cam = argv[0] if argv else 'overview'
out = argv[1] if len(argv) > 1 else '//preview.png'
width = int(argv[2]) if len(argv) > 2 else 960
samples = int(argv[3]) if len(argv) > 3 else 64

scene = bpy.context.scene
scene.camera = bpy.data.objects['CAM_' + cam]
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'OPTIX'
scene.cycles.device = 'GPU'
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPTIX'
scene.cycles.max_bounces = 6
scene.cycles.transparent_max_bounces = 8
scene.render.resolution_x = width
scene.render.resolution_y = int(width * 9 / 16)
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.view_settings.exposure = 0.0
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('WROTE', out)
