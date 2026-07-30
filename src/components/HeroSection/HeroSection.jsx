import { useEffect, useRef } from "react";
import "./HeroSection.css";

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const CODEC = `
#ifdef PACKED
vec2 packH(float h){
  float v = clamp(h / HRANGE * 0.5 + 0.5, 0.0, 1.0) * 65535.0;
  float hi = floor(v / 256.0);
  return vec2(hi / 255.0, (v - hi * 256.0) / 255.0);
}
float unpackH(vec2 p){
  return ((p.x * 255.0 * 256.0 + p.y * 255.0) / 65535.0 * 2.0 - 1.0) * HRANGE;
}
vec4 encode(float cur, float prv){ return vec4(packH(cur), packH(prv)); }
float curOf(vec4 t){ return unpackH(t.rg); }
float prvOf(vec4 t){ return unpackH(t.ba); }
#else
vec4 encode(float cur, float prv){ return vec4(cur, prv, 0.0, 1.0); }
float curOf(vec4 t){ return t.r; }
float prvOf(vec4 t){ return t.g; }
#endif
`;

const FRAG_SIM = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_prev;
uniform vec2  u_texel;
uniform vec2  u_grid;
uniform float u_c2;
uniform float u_visc;
uniform float u_damp;
uniform float u_edgeAbsorb;
uniform float u_edgeCells;
uniform float u_clamp;

uniform vec2  u_p;
uniform vec2  u_pPrev;
uniform float u_amp;
uniform float u_radius;
uniform float u_fallSq;
uniform float u_aspect;
uniform float u_dipole;

${CODEC}

float hAt(vec2 uv){ return curOf(texture2D(u_prev, uv)); }

float segDist(vec2 p, vec2 a, vec2 b, float asp){
  vec2 pa = (p - a) * vec2(asp, 1.0);
  vec2 ba = (b - a) * vec2(asp, 1.0);
  float d = dot(ba, ba);
  float h = (d > 1e-9) ? clamp(dot(pa, ba) / d, 0.0, 1.0) : 0.0;
  return length(pa - ba * h);
}

void main(){
  vec4 s   = texture2D(u_prev, v_uv);
  float cur = curOf(s);
  float prv = prvOf(s);

  float l = hAt(v_uv + vec2(u_texel.x, 0.0))
          + hAt(v_uv - vec2(u_texel.x, 0.0))
          + hAt(v_uv + vec2(0.0, u_texel.y))
          + hAt(v_uv - vec2(0.0, u_texel.y))
          - 4.0 * cur;

  float nxt = cur * u_damp;
  nxt += u_visc * l;

  if (u_amp != 0.0){
    float d = segDist(v_uv, u_pPrev, u_p, u_aspect) / max(u_radius, 1e-5);
    nxt += u_amp * exp(-d * d * u_fallSq);
  }

  vec2 cell  = v_uv * u_grid;
  vec2 dEdge = min(cell, u_grid - cell);
  float fade = mix(u_edgeAbsorb, 1.0, smoothstep(0.0, u_edgeCells, min(dEdge.x, dEdge.y)));
  nxt *= fade;

  nxt = clamp(nxt, -u_clamp, u_clamp);
  gl_FragColor = encode(nxt, cur);
}`;

const FRAG_NOISE = `
precision highp float;
varying vec2 v_uv;

uniform float u_time;
uniform float u_aspect;
uniform float u_scale;
uniform float u_drift;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x  = 2.0 * fract(p * C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm3(vec2 p){
  float s = 0.0;
  float a = 0.5;
  for(int i = 0; i < 3; i++){
    s += a * snoise(p);
    p  = p * 2.02 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return s;
}

void main(){
  vec2 p = vec2(v_uv.x * u_aspect, v_uv.y) * u_scale;
  float a = fbm3(p - vec2(u_time * u_drift, u_time * u_drift * 0.6));
  float b = fbm3(p * 0.41 + vec2(11.3, 4.9) + vec2(0.0, u_time * u_drift * 0.4));
  gl_FragColor = vec4(a * 0.5 + 0.5, b * 0.5 + 0.5, 0.0, 1.0);
}`;

const FRAG_COMP = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_base;
uniform sampler2D u_chrome;
uniform sampler2D u_sim;
uniform sampler2D u_noise;

uniform vec2  u_res;
uniform vec2  u_grid;
uniform vec2  u_simTexel;
uniform float u_time;
uniform float u_canvasAspect;
uniform float u_imgAspect;
uniform vec2  u_focus;

uniform float u_gradTexels;
uniform float u_refraction;
uniform float u_refractMax;
uniform float u_chromatic;
uniform float u_chromaEdge;
uniform float u_chromaMax;

uniform float u_normalScale;
uniform float u_specStrength;
uniform float u_shininess;
uniform vec3  u_lightDir;
uniform vec3  u_specTint;

uniform float u_maskHeight;
uniform float u_maskGrad;
uniform float u_maskLo;
uniform float u_maskHi;
uniform float u_maskNoise;
uniform float u_noiseTile;

uniform float u_edgeGlow;
uniform float u_edgeGlowTight;

uniform vec3  u_gc0, u_gc1, u_gc2, u_gc3, u_gc4;
uniform vec4  u_gt;
uniform float u_gradPhase, u_gradScale, u_gradMix;
uniform float u_lumLo, u_lumHi, u_lumGamma;
uniform int   u_gradWrap;

uniform float u_bloom, u_bloomRadius, u_bloomThreshold;
uniform float u_vignette, u_vigInner, u_vigOuter;
uniform vec2  u_vigCenter;
uniform float u_scanlines, u_scanFreq, u_grain;

${CODEC}

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 softLimit(vec2 v, float m){
  float l = length(v);
  if (l < 1e-7 || m <= 0.0) return v;
  return v * (m * (1.0 - exp(-l / m)) / l);
}

#ifdef PACKED
float hRaw(vec2 uv){ return curOf(texture2D(u_sim, uv)); }
float hSample(vec2 uv){
  vec2 t = uv * u_grid - 0.5;
  vec2 f = fract(t);
  f = f * f * (3.0 - 2.0 * f);
  vec2 b = (floor(t) + 0.5) * u_simTexel;
  float h00 = hRaw(b);
  float h10 = hRaw(b + vec2(u_simTexel.x, 0.0));
  float h01 = hRaw(b + vec2(0.0, u_simTexel.y));
  float h11 = hRaw(b + u_simTexel);
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
#else
float hSample(vec2 uv){
  vec2 t = uv * u_grid - 0.5;
  vec2 f = fract(t);
  f = f * f * (3.0 - 2.0 * f);
  return texture2D(u_sim, (floor(t) + 0.5 + f) * u_simTexel).r;
}
#endif

uniform float u_imgScale;

vec2 coverUV(vec2 uv){
  vec2 s = (u_canvasAspect > u_imgAspect)
         ? vec2(1.0, u_imgAspect / u_canvasAspect)
         : vec2(u_canvasAspect / u_imgAspect, 1.0);
  vec2 p = (uv - 0.5) * s * u_imgScale + 0.5;
  p += (vec2(0.5) - u_focus) * (vec2(1.0) - s) * vec2(-1.0, 1.0);
  return p;
}

float wrapT(float t){
  if (u_gradWrap == 0) return 1.0 - abs(mod(t, 2.0) - 1.0);
  if (u_gradWrap == 2) return fract(t);
  return clamp(t, 0.0, 1.0);
}

vec3 gradient(float t){
  t = wrapT(t);
  if      (t < u_gt.x) return mix(u_gc0, u_gc1,  t / max(u_gt.x, 1e-5));
  else if (t < u_gt.y) return mix(u_gc1, u_gc2, (t - u_gt.x) / max(u_gt.y - u_gt.x, 1e-5));
  else if (t < u_gt.z) return mix(u_gc2, u_gc3, (t - u_gt.y) / max(u_gt.z - u_gt.y, 1e-5));
  return mix(u_gc3, u_gc4, (t - u_gt.z) / max(u_gt.w - u_gt.z, 1e-5));
}

float lumOf(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 mapChrome(vec3 raw){
  if (u_gradMix <= 0.001) return raw;
  float l = clamp((lumOf(raw) - u_lumLo) / max(u_lumHi - u_lumLo, 1e-4), 0.0, 1.0);
  l = pow(l, u_lumGamma);
  vec3 g = gradient(l * u_gradScale + u_gradPhase);
  return mix(raw, g, u_gradMix);
}

void main(){
  vec2 uv = v_uv;
  vec2 e = u_simTexel * u_gradTexels;
  float hL = hSample(uv - vec2(e.x, 0.0));
  float hR = hSample(uv + vec2(e.x, 0.0));
  float hD = hSample(uv - vec2(0.0, e.y));
  float hU = hSample(uv + vec2(0.0, e.y));

  vec2 n = vec2(hR - hL, hU - hD);
  float glen = length(n);

  vec2 refr = softLimit(n * u_refraction, u_refractMax);
  vec2 ca = softLimit(n * u_chromatic * (1.0 + u_chromaEdge * smoothstep(0.0, 0.06, glen)), u_chromaMax);

  vec2 cuv = coverUV(uv + refr);
  vec2 cR  = coverUV(uv + refr + ca);
  vec2 cB  = coverUV(uv + refr - ca);

  vec2 z = vec2(0.0), o = vec2(1.0);

  vec3 base = vec3(
    texture2D(u_base, clamp(cR,  z, o)).r,
    texture2D(u_base, clamp(cuv, z, o)).g,
    texture2D(u_base, clamp(cB,  z, o)).b
  );

  vec3 chRaw = vec3(
    texture2D(u_chrome, clamp(cR,  z, o)).r,
    texture2D(u_chrome, clamp(cuv, z, o)).g,
    texture2D(u_chrome, clamp(cB,  z, o)).b
  );
  vec3 helmet = mapChrome(chRaw);

  vec2 nz = texture2D(u_noise, uv * u_noiseTile).rg;
  float energy = abs(hSample(uv)) * u_maskHeight + glen * u_maskGrad;
  float raw = smoothstep(u_maskLo, u_maskHi, energy);
  energy += (nz.r - 0.5) * u_maskNoise * (1.0 - abs(raw * 2.0 - 1.0));
  float mask = clamp(smoothstep(u_maskLo, u_maskHi, energy), 0.0, 1.0);

  vec3 nrm = normalize(vec3(-n * u_normalScale, 1.0));
  float spec = pow(max(dot(nrm, normalize(u_lightDir)), 0.0), u_shininess);

  vec3 col = mix(base, helmet, mask);
  col += u_specTint * spec * u_specStrength * mask;
  col += mix(u_gc2, u_gc3, 0.6) * (1.0 - exp(-glen * u_edgeGlowTight)) * u_edgeGlow;

  float inB = step(0.0, cuv.x) * (1.0 - step(1.0, cuv.x)) * step(0.0, cuv.y) * (1.0 - step(1.0, cuv.y));
  col = mix(vec3(1.0, 1.0, 1.0), col, inB);

  gl_FragColor = vec4(col, 1.0);
}`;

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export default function HeroSection() {
  const heroRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    if (!hero || !canvas) return;

    let running = true;
    let animFrameId = null;

    const P = {
      BASE_SRC: "/RAI/RAI-XRAY.png",
      CHROME_SRC: "/RAI/RAI-ORI.png",
      IMG_W: 1920,
      IMG_H: 1080,
      imgScale: 1.0,
      imgFocus: [0.5, 0.5],
      simLong: 288,
      simHz: 120,
      simMaxSteps: 4,
      waveC: 0.5,
      damping: 0.955,
      viscosity: 0.06,
      edgeAbsorb: 0.9,
      edgeCells: 16,
      hClamp: 1.1,
      impulseBase: 0.1,
      impulseGain: 0.05,
      impulseMax: 0.2,
      impulseMinSpeed: 0.004,
      impulseRadius: 0.15,
      impulseFallSq: 3.0,
      gradTexels: 1.0,
      refraction: 0.075,
      refractMax: 0.0045,
      chromatic: 0.03,
      chromaEdge: 1.2,
      chromaMax: 0.002,
      normalScale: 30.0,
      specStrength: 0.5,
      shininess: 44.0,
      lightDir: [-0.42, 0.55, 0.72],
      specTint: [0.78, 0.9, 1.0],
      maskHeight: 1.0,
      maskGrad: 0.8,
      maskLo: 0.08,
      maskHi: 0.3,
      maskNoise: 0.055,
      noiseTile: 2.4,
      edgeGlow: 0.25,
      edgeGlowTight: 6.0,
      gradStops: [
        { t: 0.0, c: "#000000" },
        { t: 0.25, c: "#070B1F" },
        { t: 0.5, c: "#3A2170" },
        { t: 0.75, c: "#4E9AD4" },
        { t: 1.0, c: "#DCEEFF" },
      ],
      gradPhase: 0,
      gradScale: 100,
      gradMix: 0, // 0 = retain natural colors of rai-human.webp
      gradWrap: "mirror",
      lumLo: 0.0,
      lumHi: 0.3,
      lumGamma: 0.72,
      bloom: 0.0,
      bloomRadius: 2.6,
      bloomThreshold: 0.62,
      vignette: 0.0,
      vignetteCenter: [0.5, 0.56],
      vignetteInner: 0.26,
      vignetteOuter: 0.92,
      scanlines: 0.0,
      scanlineFreq: 1.35,
      grain: 0.0,
      idleDrift: true,
      idleDelayMs: 1600,
      idleSpeed: 0.85,
      idleRadius: [0.22, 0.15],
      idleCenter: [0.5, 0.52],
      idleBoost: 1.0,
      idleDropMs: 1250,
      idleDropAmp: 0.0,
      idleDropSpread: [0.3, 0.26],
      narrowScale: 0.45,
      noiseSize: 256,
      noiseScale: 9.0,
      noiseDrift: 0.1,
      dprCap: 2.0,
      dprCapMobile: 1.5,
      idleStopEps: 0.0015,
    };

    const D = {
      c2: P.waveC * P.waveC,
      gradPhase: P.gradPhase / 100,
      gradScale: P.gradScale / 100,
      gradMix: P.gradMix / 100,
      gradWrap: P.gradWrap === "mirror" ? 0 : P.gradWrap === "repeat" ? 2 : 1,
      gradCols: P.gradStops.map((s) => hexToRgb(s.c)),
      gradTs: [P.gradStops[1].t, P.gradStops[2].t, P.gradStops[3].t, P.gradStops[4].t],
      light: [
        P.lightDir[0] / Math.hypot(P.lightDir[0], P.lightDir[1], P.lightDir[2]),
        P.lightDir[1] / Math.hypot(P.lightDir[0], P.lightDir[1], P.lightDir[2]),
        P.lightDir[2] / Math.hypot(P.lightDir[0], P.lightDir[1], P.lightDir[2]),
      ],
    };

    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false };
    let gl = canvas.getContext("webgl2", opts);
    const isGL2 = !!gl;
    if (!gl) gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
    if (!gl) return;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    function program(fragSrc, defines) {
      const pre = defines || "";
      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, pre + fragSrc);
      if (!vs || !fs) return null;
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, "a_pos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return p;
    }

    function uniforms(prog) {
      const map = Object.create(null);
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(prog, i);
        const nm = info.name.replace(/\[0\]$/, "");
        map[nm] = gl.getUniformLocation(prog, info.name);
      }
      return map;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let simType = gl.UNSIGNED_BYTE, simInternal = gl.RGBA, PACKED = true;
    if (isGL2) {
      if (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")) {
        simType = gl.HALF_FLOAT; simInternal = gl.RGBA16F; PACKED = false;
      }
    } else {
      const hf = gl.getExtension("OES_texture_half_float");
      if (hf) {
        gl.getExtension("OES_texture_half_float_linear");
        simType = hf.HALF_FLOAT_OES; simInternal = gl.RGBA; PACKED = false;
      }
    }

    function defines() {
      return "#define HRANGE " + P.hClamp.toFixed(1) + "\n" + (PACKED ? "#define PACKED 1\n" : "");
    }

    const progSim = program(FRAG_SIM, defines());
    const progComp = program(FRAG_COMP, defines());
    const progNoise = program(FRAG_NOISE, "");
    if (!progSim || !progComp || !progNoise) return;

    const uSim = uniforms(progSim);
    const uComp = uniforms(progComp);
    const uNoise = uniforms(progNoise);

    function makeTarget(w, h, type, internal, filter) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return ok ? { tex, fbo, w, h } : null;
    }

    let SW = 1, SH = 1;
    let simA = null, simB = null, read = null, write = null;

    function buildSim(w, h) {
      const L = P.simLong;
      const nw = w >= h ? L : Math.max(16, Math.round((L * w) / h));
      const nh = w >= h ? Math.max(16, Math.round((L * h) / w)) : L;
      if (nw === SW && nh === SH && simA && simB) return;
      if (simA) { gl.deleteTexture(simA.tex); gl.deleteFramebuffer(simA.fbo); }
      if (simB) { gl.deleteTexture(simB.tex); gl.deleteFramebuffer(simB.fbo); }
      SW = nw; SH = nh;
      const filter = PACKED ? gl.NEAREST : gl.LINEAR;
      simA = makeTarget(SW, SH, simType, simInternal, filter);
      simB = makeTarget(SW, SH, simType, simInternal, filter);
      read = simA; write = simB;
      clearSim();
    }

    function clearSim() {
      const c = PACKED ? [0.5, 0.5, 0.5, 0.5] : [0, 0, 0, 1];
      [simA, simB].forEach((t) => {
        if (!t) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.clearColor(c[0], c[1], c[2], c[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    const noiseRT = makeTarget(P.noiseSize, P.noiseSize, gl.UNSIGNED_BYTE, gl.RGBA, gl.LINEAR);

    function makeImageTexture() {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      return t;
    }

    const texBase = makeImageTexture();
    const texChrome = makeImageTexture();

    function loadImage(src, tex) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          try {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            resolve(img);
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error("Image load failed: " + src));
        img.src = src;
      });
    }

    const ptr = { x: 0.5, y: 0.55, px: 0.5, py: 0.55, has: false, lastInput: -1e9 };

    function onPointer(e) {
      const r = hero.getBoundingClientRect();
      ptr.x = (e.clientX - r.left) / r.width;
      ptr.y = 1.0 - (e.clientY - r.top) / r.height;
      ptr.has = true;
      ptr.lastInput = performance.now();
    }

    hero.addEventListener("pointermove", onPointer, { passive: true });
    hero.addEventListener("pointerdown", onPointer, { passive: true });
    hero.addEventListener("pointerleave", () => { ptr.has = false; }, { passive: true });

    let W = 1, H = 1;
    function resize() {
      const isMobile = matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? P.dprCapMobile : P.dprCap);
      const w = Math.max(1, Math.round(hero.clientWidth * dpr));
      const h = Math.max(1, Math.round(hero.clientHeight * dpr));
      if (w === W && h === H) return;
      W = w; H = h;
      canvas.width = W; canvas.height = H;
      buildSim(W, H);
    }

    function bindTex(unit, tex, loc) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc, unit);
    }

    function drawQuad() {
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function simStep(ax, ay, bx, by, amp, dipole) {
      gl.useProgram(progSim);
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.viewport(0, 0, SW, SH);
      bindTex(0, read.tex, uSim.u_prev);
      gl.uniform2f(uSim.u_texel, 1 / SW, 1 / SH);
      gl.uniform2f(uSim.u_grid, SW, SH);
      gl.uniform1f(uSim.u_c2, D.c2);
      gl.uniform1f(uSim.u_visc, P.viscosity);
      gl.uniform1f(uSim.u_damp, P.damping);
      gl.uniform1f(uSim.u_edgeAbsorb, P.edgeAbsorb);
      gl.uniform1f(uSim.u_edgeCells, P.edgeCells);
      gl.uniform1f(uSim.u_clamp, P.hClamp);
      gl.uniform2f(uSim.u_pPrev, ax, ay);
      gl.uniform2f(uSim.u_p, bx, by);
      gl.uniform1f(uSim.u_amp, amp);
      gl.uniform1f(uSim.u_radius, P.impulseRadius);
      gl.uniform1f(uSim.u_fallSq, P.impulseFallSq);
      gl.uniform1f(uSim.u_aspect, W / H);
      gl.uniform1f(uSim.u_dipole, dipole ? 1 : 0);
      drawQuad();
      const tmp = read; read = write; write = tmp;
    }

    let t0 = performance.now(), prevT = t0, acc = 0;
    const SIM_DT = 1 / P.simHz;

    function stepSim(now, dt) {
      const idleFor = now - ptr.lastInput;
      const idleScale = W < H ? P.narrowScale : 1.0;
      if (P.idleDrift && (!ptr.has || idleFor > P.idleDelayMs)) {
        const tt = ((now - t0) / 1000) * P.idleSpeed;
        ptr.x = P.idleCenter[0] + Math.cos(tt * 1.0) * P.idleRadius[0] + Math.cos(tt * 2.3) * P.idleRadius[0] * 0.28;
        ptr.y = P.idleCenter[1] + Math.sin(tt * 1.37) * P.idleRadius[1] + Math.sin(tt * 0.71) * P.idleRadius[1] * 0.33;
      }

      const asp = W / H;
      const dx = (ptr.x - ptr.px) * asp;
      const dy = ptr.y - ptr.py;
      const speed = Math.hypot(dx, dy) / Math.max(dt, 1e-4);
      let amp = 0;
      if (speed > P.impulseMinSpeed) {
        amp = Math.min(P.impulseBase + speed * P.impulseGain, P.impulseMax) * idleScale;
      }

      acc += dt;
      let n = Math.floor(acc / SIM_DT);
      if (n > P.simMaxSteps) { n = P.simMaxSteps; acc = 0; }
      else acc -= n * SIM_DT;

      const steps = Math.max(n, 1);
      for (let k = 0; k < steps; k++) {
        const a = k / steps, b = (k + 1) / steps;
        const ax = ptr.px + (ptr.x - ptr.px) * a;
        const ay = ptr.py + (ptr.y - ptr.py) * a;
        const bx = ptr.px + (ptr.x - ptr.px) * b;
        const by = ptr.py + (ptr.y - ptr.py) * b;
        simStep(ax, ay, bx, by, amp, true);
      }

      ptr.px = ptr.x; ptr.py = ptr.y;
    }

    function stepNoise(now) {
      gl.useProgram(progNoise);
      gl.bindFramebuffer(gl.FRAMEBUFFER, noiseRT.fbo);
      gl.viewport(0, 0, P.noiseSize, P.noiseSize);
      gl.uniform1f(uNoise.u_time, (now - t0) / 1000);
      gl.uniform1f(uNoise.u_aspect, W / H);
      gl.uniform1f(uNoise.u_scale, P.noiseScale);
      gl.uniform1f(uNoise.u_drift, P.noiseDrift);
      drawQuad();
    }

    function stepComposite(now) {
      const time = (now - t0) / 1000;
      gl.useProgram(progComp);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);

      bindTex(0, texBase, uComp.u_base);
      bindTex(1, texChrome, uComp.u_chrome);
      bindTex(2, read.tex, uComp.u_sim);
      bindTex(3, noiseRT.tex, uComp.u_noise);

      gl.uniform2f(uComp.u_res, W, H);
      gl.uniform2f(uComp.u_grid, SW, SH);
      gl.uniform2f(uComp.u_simTexel, 1 / SW, 1 / SH);
      gl.uniform1f(uComp.u_time, time);
      gl.uniform1f(uComp.u_canvasAspect, W / H);
      gl.uniform1f(uComp.u_imgAspect, P.IMG_W / P.IMG_H);
      gl.uniform1f(uComp.u_imgScale, P.imgScale);
      gl.uniform2f(uComp.u_focus, P.imgFocus[0], P.imgFocus[1]);

      gl.uniform1f(uComp.u_gradTexels, P.gradTexels);
      gl.uniform1f(uComp.u_refraction, P.refraction);
      gl.uniform1f(uComp.u_refractMax, P.refractMax);
      gl.uniform1f(uComp.u_chromatic, P.chromatic);
      gl.uniform1f(uComp.u_chromaEdge, P.chromaEdge);
      gl.uniform1f(uComp.u_chromaMax, P.chromaMax);

      gl.uniform1f(uComp.u_normalScale, P.normalScale);
      gl.uniform1f(uComp.u_specStrength, P.specStrength);
      gl.uniform1f(uComp.u_shininess, P.shininess);
      gl.uniform3f(uComp.u_lightDir, D.light[0], D.light[1], D.light[2]);
      gl.uniform3f(uComp.u_specTint, P.specTint[0], P.specTint[1], P.specTint[2]);

      gl.uniform1f(uComp.u_maskHeight, P.maskHeight);
      gl.uniform1f(uComp.u_maskGrad, P.maskGrad);
      gl.uniform1f(uComp.u_maskLo, P.maskLo);
      gl.uniform1f(uComp.u_maskHi, P.maskHi);
      gl.uniform1f(uComp.u_maskNoise, P.maskNoise);
      gl.uniform1f(uComp.u_noiseTile, P.noiseTile);

      gl.uniform1f(uComp.u_edgeGlow, P.edgeGlow);
      gl.uniform1f(uComp.u_edgeGlowTight, P.edgeGlowTight);

      gl.uniform3fv(uComp.u_gc0, D.gradCols[0]);
      gl.uniform3fv(uComp.u_gc1, D.gradCols[1]);
      gl.uniform3fv(uComp.u_gc2, D.gradCols[2]);
      gl.uniform3fv(uComp.u_gc3, D.gradCols[3]);
      gl.uniform3fv(uComp.u_gc4, D.gradCols[4]);
      gl.uniform4f(uComp.u_gt, D.gradTs[0], D.gradTs[1], D.gradTs[2], D.gradTs[3]);
      gl.uniform1f(uComp.u_gradPhase, D.gradPhase);
      gl.uniform1f(uComp.u_gradScale, D.gradScale);
      gl.uniform1f(uComp.u_gradMix, D.gradMix);
      gl.uniform1f(uComp.u_lumLo, P.lumLo);
      gl.uniform1f(uComp.u_lumHi, P.lumHi);
      gl.uniform1f(uComp.u_lumGamma, P.lumGamma);
      gl.uniform1i(uComp.u_gradWrap, D.gradWrap);

      gl.uniform1f(uComp.u_bloom, P.bloom);
      gl.uniform1f(uComp.u_bloomRadius, P.bloomRadius);
      gl.uniform1f(uComp.u_bloomThreshold, P.bloomThreshold);
      gl.uniform1f(uComp.u_vignette, P.vignette);
      gl.uniform2f(uComp.u_vigCenter, P.vignetteCenter[0], P.vignetteCenter[1]);
      gl.uniform1f(uComp.u_vigInner, P.vignetteInner);
      gl.uniform1f(uComp.u_vigOuter, P.vignetteOuter);
      gl.uniform1f(uComp.u_scanlines, P.scanlines);
      gl.uniform1f(uComp.u_scanFreq, P.scanlineFreq);
      gl.uniform1f(uComp.u_grain, P.grain);

      drawQuad();
    }

    function frame(now) {
      if (!running) return;
      animFrameId = requestAnimationFrame(frame);
      if (document.hidden) { prevT = now; return; }

      let dt = (now - prevT) / 1000;
      prevT = now;
      if (dt > 0.05) dt = 0.05;
      if (dt <= 0) return;

      resize();
      stepSim(now, dt);
      stepNoise(now);
      stepComposite(now);
    }

    Promise.all([
      loadImage(P.BASE_SRC, texBase),
      loadImage(P.CHROME_SRC, texChrome),
    ]).then(() => {
      if (!running) return;
      resize();
      t0 = prevT = performance.now();
      animFrameId = requestAnimationFrame(frame);
    }).catch((err) => {
      console.error("Liquid reveal image load error:", err);
    });

    return () => {
      running = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, []);

  return (
    <section className="hero" ref={heroRef}>
      <canvas ref={canvasRef} className="hero-gl-canvas" />
      {/* Invisible hover-portrait element maintained for App.jsx scroll pin reference */}
      <div className="hover-portrait" />
      {/* Subtle side black shadow gradient overlay matching reference image */}
      <div className="hero-side-shadows" aria-hidden="true" />

      {/* Hero Content Overlay matching dashboard reference design */}
      <div className="hero-overlay-content">

      </div>
    </section>
  );
}




