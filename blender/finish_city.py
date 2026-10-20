"""Post-process the city panorama EXR into an 8-bit texture for the window shader.

Encoding: y = x / (1 + x) (Reinhard), then sRGB. The shader inverts it (x = y / (1 - y)) so street
lights keep their HDR punch for bloom while the file stays a small JPEG/WebP.
A soft glow (rain haze) is added around bright lights before encoding.

blender -b --factory-startup --python-exit-code 1 -P blender/finish_city.py -- [exposure]
"""
import bpy
import numpy as np
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(__file__))
import lib  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
EXPOSURE = float(argv[0]) if argv else 1.0

src = os.path.join(lib.GEN, 'city_pano.exr')
img = bpy.data.images.load(src)
w, h = img.size
px = np.empty(w * h * 4, dtype=np.float32)
img.pixels.foreach_get(px)
rgb = px.reshape(h, w, 4)[::-1, :, :3].astype(np.float32) * EXPOSURE   # flip to top-down rows


def blur(a, r, passes=3):
    """Separable box blur (approximate gaussian)."""
    out = a
    for _ in range(passes):
        k = 2 * r + 1
        c = np.cumsum(np.pad(out, ((0, 0), (r + 1, r), (0, 0)), mode='edge'), axis=1)
        out = (c[:, k:] - c[:, :-k]) / k
        c = np.cumsum(np.pad(out, ((r + 1, r), (0, 0), (0, 0)), mode='edge'), axis=0)
        out = (c[k:, :] - c[:-k, :]) / k
    return out


# glow from highlights, computed at quarter resolution
bright = np.clip(rgb - 1.2, 0, 40)
small = bright[:h - h % 4, :w - w % 4].reshape(h // 4, 4, w // 4, 4, 3).mean(axis=(1, 3))
g1 = blur(small, 2)
g2 = blur(small, 8)
glow = 0.6 * g1 + 0.4 * g2
glow = np.repeat(np.repeat(glow, 4, axis=0), 4, axis=1)
gh, gw = glow.shape[:2]
rgb[:gh, :gw] += glow * 0.35

enc = rgb / (1.0 + rgb)
srgb = np.where(enc <= 0.0031308, enc * 12.92, 1.055 * np.power(np.clip(enc, 0, 1), 1 / 2.4) - 0.055)
out8 = (np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8)


def write_png(path, arr):
    hh, ww, _ = arr.shape
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(hh))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', ww, hh, 8, 2, 0, 0, 0)) + \
        chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)


dst = os.path.join(lib.GEN, 'city.png')
write_png(dst, out8)
print('CITY_PNG', dst, w, h, 'max', float(rgb.max()), 'mean', float(rgb.mean()))
