import { ShaderMaterial, Vector2, Vector3, type CubeTexture, type Texture } from 'three'

/**
 * Rainy window glass.
 * - The city is a partial equirectangular panorama rendered in Blender from the
 *   window (blender/build_city.py). Each fragment intersects its view ray with a
 *   proxy sphere around the capture point, so the view has believable parallax
 *   as the camera moves between shots.
 * - Static droplets + a few slow sliding drops refract and blur the view.
 * - Faint falling rain streaks, lit by the city behind them.
 * - Box-projected reflection of the room (captured cubemap), Fresnel weighted.
 * The panorama is Reinhard-encoded (y = x / (1 + x)); we invert it here.
 */
export function makeWindowGlass(city: Texture) {
  return new ShaderMaterial({
    uniforms: {
      uCity: { value: city },
      uLon: { value: new Vector2((-80 * Math.PI) / 180, (80 * Math.PI) / 180) },
      uLat: { value: new Vector2((-58 * Math.PI) / 180, (38 * Math.PI) / 180) },
      // capture point = window centre (Blender (-0.06, 0.2, 1.45) -> three (x, z, -y))
      uEye: { value: new Vector3(-0.06, 1.45, -0.2) },
      uRadius: { value: 40 },
      uTime: { value: 0 },
      uRain: { value: 1 },
      uExposure: { value: 0.85 },
      uEnv: { value: null as CubeTexture | null },
      uHasEnv: { value: 0 },
      uEnvPos: { value: new Vector3(0.05, 1.05, 0.55) },
      uBoxMin: { value: new Vector3(-1.75, 0, -0.3) },
      uBoxMax: { value: new Vector3(1.75, 2.65, 3.4) },
      uReflect: { value: 1.0 },
      uFlash: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uCity;
      uniform vec2 uLon;
      uniform vec2 uLat;
      uniform vec3 uEye;
      uniform float uRadius;
      uniform float uTime;
      uniform float uRain;
      uniform float uExposure;
      uniform samplerCube uEnv;
      uniform float uHasEnv;
      uniform vec3 uEnvPos;
      uniform vec3 uBoxMin;
      uniform vec3 uBoxMax;
      uniform float uReflect;
      uniform float uFlash;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;

      // Hash without Sine (Dave Hoskins, MIT)
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }

      // one layer of beaded droplets; returns (lens normal xy, coverage)
      vec3 drops(vec2 p, float cell, float density, float seed) {
        vec2 g = p / cell + seed;
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float present = step(1.0 - density, hash12(id + 7.13));
        vec2 c = (hash22(id) - 0.5) * 0.5;
        float r = mix(0.07, 0.23, hash12(id + 3.71));
        vec2 d = (f - c) / r;
        d.y *= 0.9;
        float l = length(d);
        float m = present * (1.0 - smoothstep(0.8, 1.0, l));
        return vec3(d * m, m);
      }

      // slow sliding drop with a wet trail
      vec3 slider(vec2 p, float t) {
        float colW = 0.06;
        float cx = floor(p.x / colW);
        float h1 = hash12(vec2(cx, 1.37));
        if (h1 < 0.62) return vec3(0.0);
        float wob = sin(p.y * 38.0 + cx * 3.1) * 0.0012;
        float fx = (fract(p.x / colW) - 0.5) * colW + wob;
        float speed = mix(0.012, 0.03, hash12(vec2(cx, 2.13)));
        float span = 2.2;
        float head = 2.6 - span * fract(t * speed / span + h1 * 7.0);
        float dy = p.y - head;
        float r = 0.0032;
        vec2 d = vec2(fx, dy * (dy < 0.0 ? 1.15 : 0.7)) / r;
        float hm = 1.0 - smoothstep(0.75, 1.0, length(d));
        float trail = (1.0 - smoothstep(0.0, 0.0011, abs(fx))) * step(0.0, dy) * (1.0 - smoothstep(0.0, 0.16, dy));
        // tiny beads left behind in the trail
        vec2 bid = floor(vec2(cx, p.y / 0.012));
        float bead = trail * step(0.55, hash12(bid)) * (1.0 - smoothstep(0.4, 1.0, length(vec2(fx / 0.0012, fract(p.y / 0.012) * 2.0 - 1.0))));
        return vec3(d * hm, max(hm, max(trail * 0.35, bead)));
      }

      float streak(vec2 p, float t, float depth) {
        vec2 q = p * vec2(26.0, 1.0) / depth;
        q.x += q.y * 0.07;
        float col = floor(q.x);
        float fx = fract(q.x) - 0.5;
        float h = hash12(vec2(col, depth * 7.0));
        float y = fract(q.y * 0.9 + t * (1.9 + h * 1.2) + h * 17.0);
        float len = 0.11;
        float line = (1.0 - smoothstep(0.0, 0.06, abs(fx))) * smoothstep(0.0, len * 0.35, y) * (1.0 - smoothstep(len * 0.35, len, y));
        return line * step(0.62, h);
      }

      vec3 cityAt(vec3 dir, float lod) {
        vec3 oc = vWorldPos - uEye;
        float b = dot(oc, dir);
        float c = dot(oc, oc) - uRadius * uRadius;
        float t = -b + sqrt(max(b * b - c, 0.0));
        vec3 d = normalize(vWorldPos + dir * t - uEye);
        float lon = atan(d.x, -d.z);
        float lat = asin(clamp(d.y, -1.0, 1.0));
        vec2 uv = vec2((lon - uLon.x) / (uLon.y - uLon.x), (lat - uLat.x) / (uLat.y - uLat.x));
        vec3 y = textureLod(uCity, clamp(uv, vec2(0.001), vec2(0.999)), lod).rgb;
        return y / max(vec3(1.0) - y, vec3(0.025)) * uExposure;
      }

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(vWorldPos - cameraPosition);
        vec2 gp = vWorldPos.xy;
        float t = uTime;

        vec3 d1 = drops(gp, 0.014, 0.2, 0.0);
        vec3 d2 = drops(gp, 0.006, 0.16, 11.3);
        vec3 s = slider(gp, t);
        vec2 lens = d1.xy * 0.9 + d2.xy * 0.55 + s.xy * 1.2;
        float wet = clamp(max(max(d1.z, d2.z * 0.8), s.z) * uRain, 0.0, 1.0);

        vec3 dir = normalize(V + vec3(-lens * 0.045 * uRain, 0.0));
        // clear glass stays a touch soft; drops show a blurred, lensed view
        vec3 city = cityAt(dir, mix(0.35, 3.6, wet));
        vec3 haze = cityAt(V, 5.5);

        // falling rain outside, visible where it is lit
        float rain = 0.0;
        rain += streak(gp + V.xy / max(-V.z, 0.2) * 1.5, t, 1.5);
        rain += streak(gp + V.xy / max(-V.z, 0.2) * 4.0, t * 0.8, 4.0) * 0.7;
        float lum = dot(haze, vec3(0.3, 0.55, 0.15));
        vec3 rainCol = (haze * 2.2 + vec3(0.025, 0.028, 0.035)) * rain * 0.16 * uRain;

        // droplets catch a little light and darken at their rims
        float rim = smoothstep(0.55, 1.0, length(lens)) * wet;
        city *= 1.0 - rim * 0.35;
        city = mix(city, haze, wet * 0.35);

        // reflection of the room (box-projected cubemap)
        vec3 R = reflect(V, N);
        vec3 t1 = (uBoxMax - vWorldPos) / R;
        vec3 t2 = (uBoxMin - vWorldPos) / R;
        vec3 tm = max(t1, t2);
        float tb = min(min(tm.x, tm.y), tm.z);
        vec3 rd = vWorldPos + R * tb - uEnvPos;
        vec3 refl = uHasEnv > 0.5 ? textureLod(uEnv, rd, 0.0).rgb : vec3(0.0);
        float cosT = clamp(dot(-V, N), 0.0, 1.0);
        float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);

        // lightning: the clouds light up from above, the city and the falling rain catch it
        if (uFlash > 0.0) {
          float sky = smoothstep(-0.12, 0.42, dir.y);
          city += uFlash * (vec3(0.55, 0.62, 0.85) * (0.08 + 0.92 * sky) * 1.6 + city * 1.4);
          rainCol += uFlash * vec3(0.5, 0.55, 0.7) * rain * 0.6;
        }

        vec3 col = city * (1.0 - F) * vec3(0.93, 0.96, 1.0) + rainCol + refl * F * uReflect * (1.0 + wet * 0.6);
        col += vec3(lum) * 0.04 * wet;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
