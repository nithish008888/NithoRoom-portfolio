import { ShaderMaterial, Vector3, type CubeTexture, type Texture } from 'three'

/**
 * CRT tube face. The picture comes from a 2D canvas (CanvasTexture or video);
 * the shader adds the tube: slight curvature, RGB fringing, scanlines, edge
 * falloff, static/tracking noise and the glass reflection. Kept restrained on
 * purpose — the screen must stay readable.
 */
export function makeCRT(map: Texture, opts: { phosphor?: 'color' | 'green' } = {}) {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: { value: 0 },
      uPower: { value: 1 },
      uStatic: { value: 0 },
      uBrightness: { value: opts.phosphor === 'green' ? 1.15 : 1.45 },
      uScan: { value: opts.phosphor === 'green' ? 0.45 : 0.55 },
      uGreen: { value: opts.phosphor === 'green' ? 1 : 0 },
      uEnv: { value: null as CubeTexture | null },
      uHasEnv: { value: 0 },
      uEnvPos: { value: new Vector3(0.05, 1.05, 0.55) },
      uBoxMin: { value: new Vector3(-1.75, 0, -0.3) },
      uBoxMax: { value: new Vector3(1.75, 2.65, 3.4) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uPower;
      uniform float uStatic;
      uniform float uBrightness;
      uniform float uScan;
      uniform float uGreen;
      uniform samplerCube uEnv;
      uniform float uHasEnv;
      uniform vec3 uEnvPos;
      uniform vec3 uBoxMin;
      uniform vec3 uBoxMax;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec2 uv = vUv;
        vec2 cc = uv - 0.5;
        uv = 0.5 + cc * (1.0 - 0.055 * dot(cc, cc) * 4.0);
        // horizontal tearing/jitter only while tracking (static)
        float line = floor(uv.y * 240.0);
        float jit = (hash12(vec2(line, floor(uTime * 30.0))) - 0.5) * 0.012 * uStatic;
        uv.x += jit + sin(uv.y * 9.0 + uTime * 3.0) * 0.0008 * uStatic;
        float ca = 0.0011 + 0.002 * uStatic;
        vec3 c;
        c.r = texture2D(uMap, uv + vec2(ca, 0.0)).r;
        c.g = texture2D(uMap, uv).g;
        c.b = texture2D(uMap, uv - vec2(ca, 0.0)).b;
        if (uGreen > 0.5) {
          float l = dot(c, vec3(0.3, 0.59, 0.11));
          c = vec3(0.32, 1.0, 0.45) * l + vec3(0.05, 0.16, 0.07) * smoothstep(0.0, 0.5, l);
        }
        float sl = 0.5 + 0.5 * cos(uv.y * 252.0 * 6.2831853);
        c *= mix(1.0, 0.68 + 0.32 * sl, uScan);
        // static: grainy noise with drifting bands
        float n = hash12(floor(uv * vec2(360.0, 240.0)) + fract(uTime * 13.7) * 211.0);
        float bands = 0.65 + 0.35 * sin(uv.y * 26.0 - uTime * 18.0);
        c = mix(c, vec3(n * bands) * 0.85, uStatic);
        // tube edge falloff
        vec2 e = smoothstep(vec2(0.0), vec2(0.045), uv) * smoothstep(vec2(1.0), vec2(0.955), uv);
        float edge = e.x * e.y * (1.0 - dot(cc, cc) * 0.35);
        c *= edge * uBrightness * uPower * (1.0 + 0.01 * sin(uTime * 113.0));

        // glass: faint black level + box-projected room reflection
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(vWorldPos - cameraPosition);
        vec3 R = reflect(V, N);
        vec3 t1 = (uBoxMax - vWorldPos) / R;
        vec3 t2 = (uBoxMin - vWorldPos) / R;
        vec3 tm = max(t1, t2);
        float tb = min(min(tm.x, tm.y), tm.z);
        vec3 refl = uHasEnv > 0.5 ? textureLod(uEnv, vWorldPos + R * tb - uEnvPos, 1.5).rgb : vec3(0.0);
        float F = 0.035 + 0.6 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 5.0);
        vec3 glass = vec3(0.006, 0.007, 0.0065) * (1.0 - uPower * 0.5) + refl * F;
        gl_FragColor = vec4(c + glass, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
