/*
 * Tirion — Luminous Prism & White Line Waves background.
 * Adapted from tirion-prism-white-line-waves-combined.html. The two WebGL effects
 * run on their own canvases; the shaders and visual settings are unchanged.
 * Added: a shared, user-controllable pause (window.TirionMotion) so the moving
 * background can be stopped (WCAG 2.2.2), defaulting to paused for reduced motion.
 */
(() => {
  'use strict';

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let stored = null;
  try { stored = localStorage.getItem('tirion-motion'); } catch (e) { /* storage unavailable */ }

  const motion = {
    paused: stored ? stored === 'paused' : reducedMotion,
    listeners: [],
    set(paused) {
      this.paused = paused;
      try { localStorage.setItem('tirion-motion', paused ? 'paused' : 'playing'); } catch (e) { /* ignore */ }
      this.listeners.forEach(fn => fn(paused));
    }
  };
  window.TirionMotion = motion;

  // Palettes from the supplied backgrounds. Blue is the site default; <body data-theme="white"> opts back in to white.
  const THEMES = {
    white: {
      waves: { colors: ['#ffffff', '#ffffff', '#ffffff'], opacity: 0.61 },
      prism: ['#ffffff', '#fcfdff', '#edf5ff']
    },
    blue: {
      waves: { colors: ['#123dbb', '#0026ff', '#65beff'], opacity: 1 },
      prism: ['#06105e', '#0026ff', '#9bdcff']
    }
  };
  const theme = THEMES[document.body.dataset.theme] || THEMES.blue;

  /* ------------------------------------------------------------------ */
  /* White Line Waves                                                    */
  /* ------------------------------------------------------------------ */
  (() => {
    // Original LineWaves shader retained verbatim; only its color/speed/input settings change.
    const MAX_RIPPLES = 4;
    const PIXEL_BUDGET = 2.4e6;
    const VERTEX = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`;
    const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uPixel;
uniform float uTime;
uniform float uLines;
uniform float uWidth;
uniform float uGlow;
uniform float uBrightness;
uniform float uHighlight;
uniform float uHighlightWidth;
uniform float uWarp;
uniform float uScale;
uniform float uRotation;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uCycle;
uniform float uEdge;
uniform vec4 uMouse;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform float uReveal;
uniform float uLight;
uniform float uOpacity;
out vec4 fragColor;

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
}

float smootherstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float bend(vec2 p, float t) {
  vec2 q = p * 2.0 / uScale;
  float w = 0.6 * sin(q.x * 0.55 + t * 0.4 + 0.6 * sin(q.y * 0.9 - t * 0.28));
  w += 0.21 * sin(q.x * 1.3 - t * 0.33 + q.y * 0.8 + 1.3);
  w += 0.12 * sin(q.y * 2.3 + q.x * 0.9 - t * 0.37 + 0.4);
  return w * uWarp * uScale * 0.46;
}

float river(vec2 p, float y, float t) {
  float drift = 0.7 * (0.18 * sin(p.x * 1.6 - t * 0.33 + 0.7) + 0.1 * sin(p.x * 3.1 + t * 0.21));
  float center = 0.5 * (0.2 * sin(t * 0.17) + 0.08 * sin(t * 0.29 + 1.3));
  float width = 0.13 * uHighlightWidth;
  float near = (y - center - drift) / width;
  float far = (y + 0.22 * sin(t * 0.13 + 2.0) - drift * 0.6 + 0.3) / (width * 0.55);
  return max(exp(-near * near), exp(-far * far) * 0.7);
}

vec3 palette(float x) {
  x = fract(x) * 3.0;
  if (x < 1.0) return mix(uColor1, uColor2, smoothstep(0.0, 1.0, x));
  if (x < 2.0) return mix(uColor2, uColor3, smoothstep(1.0, 2.0, x));
  return mix(uColor3, uColor1, smoothstep(2.0, 3.0, x));
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = rotate((gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y, uRotation);
  float t = uTime;

  vec2 mouse = rotate(uMouse.xy, uRotation);
  vec2 toMouse = p - mouse;
  float lens = exp(-dot(toMouse, toMouse) / (uMouse.w * uMouse.w));
  p.y -= (p.y - mouse.y) * lens * uMouse.z;

  float ring = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 ripple = uRipples[i];
    if (ripple.w <= 0.0) continue;
    float x = (length(p - rotate(ripple.xy, uRotation)) - ripple.z * 0.6) / 0.08;
    float fade = exp(-ripple.z * 1.3) * smoothstep(0.0, 0.12, ripple.z);
    float bump = exp(-x * x);
    p.y -= x * bump * 0.07 * fade;
    ring += bump * fade;
  }

  float w = bend(p, t);
  float y = p.y + w;
  float phi = y * uLines;
  float fw = max(fwidth(phi), 1e-5);
  float crowd = smoothstep(0.18, 0.5, fw);

  float fold = smoothstep(1.3, 2.2, fw * uResolution.y / uLines);
  float shimmer = mix(1.0, smoothstep(0.15, 0.85, noise(vec2(y * 1.6 + t * 0.07, p.x * 0.55 - t * 0.22))), 0.5);
  float lit = max(river(p, y, t), fold * 0.9) * shimmer;
  float light = mix(1.0, 0.07 + 0.93 * lit, uHighlight);
  light += (1.0 - light) * min(lens * step(0.0001, uMouse.z) * 0.9 + ring * 0.6, 1.0);

  float dist = abs(fract(phi + 0.5) - 0.5) / fw;
  float width = uWidth * uPixel * (1.0 + mix(1.5, 0.6, uLight) * lit * uHighlight);
  float cover = clamp(min(dist + width * 0.5, 0.5) - max(dist - width * 0.5, -0.5), 0.0, 1.0);
  cover = mix(cover, min(width * fw, 1.0), crowd);
  float halo = exp(-dist / (2.2 * uPixel)) * (1.0 - crowd) * uGlow;
  float thread = mix(1.0, 0.55 + 0.45 * hash(vec2(floor(phi + 0.5), 7.3)), 0.45 * (1.0 - crowd));

  float span = 0.5 * sqrt(aspect * aspect + 1.0);
  float sweep = -span + (2.0 * span + 0.6) * uReveal;
  float reveal = 1.0 - smoothstep(sweep - 0.6, sweep, p.x);

  float edge = 1.0;
  if (uEdge > 0.0) {
    float ex = min(uv.x, 1.0 - uv.x) * aspect;
    float ey = min(uv.y, 1.0 - uv.y);
    edge = smootherstep(0.0, uEdge * 0.5, ex) * smootherstep(0.0, uEdge * 0.5, ey);
  }

  vec3 tint = palette(y * 0.3 + p.x * 0.2 + uCycle);
  float grain = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;

  if (uLight > 0.5) {
    float low = min(tint.r, min(tint.g, tint.b));
    float chroma = max(tint.r, max(tint.g, tint.b)) - low;
    vec3 hue = (tint - low) / max(chroma, 1e-3);
    vec3 ink = mix(vec3(0.08), hue * 0.56 + 0.06, smoothstep(0.04, 0.2, chroma));
    float alpha = (cover + halo * 0.35) * thread * light * uBrightness * reveal * edge * 0.78 * uOpacity;
    alpha = clamp(alpha + grain, 0.0, 1.0);
    fragColor = vec4(ink * alpha, alpha);
    return;
  }

  float strength = (cover + halo) * thread * light * uBrightness * reveal * edge;
  vec3 color = clamp(tint * strength * uOpacity, 0.0, 1.0);
  float alpha = max(color.r, max(color.g, color.b));
  color = clamp(color + grain, 0.0, 1.0);
  fragColor = vec4(min(color, vec3(alpha)), alpha);
}`;

    // Themed palette, slower motion. All other visible defaults match the supplied example.
    const settings = Object.freeze({
      color1: theme.waves.colors[0],
      color2: theme.waves.colors[1],
      color3: theme.waves.colors[2],
      speed: 0.09,
      colorCycleSpeed: 1,
      lineCount: 96,
      lineWidth: 1.3,
      glow: 0.88,
      brightness: 1.22,
      highlight: 1,
      highlightWidth: 1,
      warpIntensity: 1,
      warpScale: 1,
      rotation: -33,
      edgeFade: 0,
      opacity: theme.waves.opacity,
      intro: true,
      lightMode: false,
      maxDevicePixelRatio: 2
    });

    const canvas = document.getElementById('waves');
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true,
      antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance'
    });
    function fail(message) {
      console.warn('Tirion LineWaves:', message);
      canvas.style.display = 'none';
    }
    if (!gl) { fail('WebGL2 is unavailable'); return; }

    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create shader');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error || 'Shader compilation failed');
      }
      return shader;
    }
    let program;
    try {
      const vs = compile(gl.VERTEX_SHADER, VERTEX);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) || 'Linking failed');
    } catch (error) { fail(error.message); return; }

    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
    }

    const vao = gl.createVertexArray();
    const u = uniforms;
    function colorRGB(hex) {
      const n = parseInt(hex.slice(1), 16);
      return [(n >>> 16 & 255)/255, (n >>> 8 & 255)/255, (n & 255)/255];
    }
    const colors = [settings.color1, settings.color2, settings.color3].map(colorRGB);
    let ratio = 1;
    let time = Math.random() * 60; // Reference begins at a varied phase.
    let cycle = 0;
    let reveal = settings.intro && !motion.paused ? 0 : 1;
    let previous = null;
    let raf = 0;
    let lost = false;
    const noRipples = new Float32Array(MAX_RIPPLES * 4);

    function resize() {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      ratio = Math.max(0.5, Math.min(
        window.devicePixelRatio || 1,
        settings.maxDevicePixelRatio,
        Math.sqrt(PIXEL_BUDGET / (w * h))
      ));
      const cw = Math.max(1, Math.round(w * ratio));
      const ch = Math.max(1, Math.round(h * ratio));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      ratio = canvas.width / w;
    }

    function draw() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      const sf = (name, value) => { if (u[name] !== undefined && u[name] !== null) gl.uniform1f(u[name], value); };
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      sf('uPixel', ratio);
      sf('uTime', time);
      sf('uLines', settings.lineCount);
      sf('uWidth', settings.lineWidth);
      sf('uGlow', settings.glow);
      sf('uBrightness', settings.brightness);
      sf('uHighlight', settings.highlight);
      sf('uHighlightWidth', settings.highlightWidth);
      sf('uWarp', settings.warpIntensity * (0.25 + 0.75 * (1 - Math.pow(1 - reveal, 3))));
      sf('uScale', settings.warpScale);
      sf('uRotation', settings.rotation * Math.PI / 180);
      gl.uniform3fv(u.uColor1, colors[0]);
      gl.uniform3fv(u.uColor2, colors[1]);
      gl.uniform3fv(u.uColor3, colors[2]);
      sf('uCycle', cycle);
      sf('uEdge', settings.edgeFade);
      gl.uniform4f(u.uMouse, 0, 0, 0, 0.2);  // Mouse influence disabled.
      if (u.uRipples !== undefined && u.uRipples !== null)
        gl.uniform4fv(u.uRipples, noRipples);  // Click ripples disabled.
      sf('uReveal', 1 - Math.pow(1 - reveal, 3));
      sf('uLight', settings.lightMode ? 1 : 0);
      sf('uOpacity', settings.opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function tick(now) {
      raf = 0;
      if (lost || document.hidden) return;
      const dt = previous === null ? 0 : Math.min(0.05, Math.max(0, (now - previous) / 1000));
      previous = now;
      if (!motion.paused) {
        time += dt * settings.speed * 2.5;
        cycle += dt * settings.speed * settings.colorCycleSpeed * 0.05;
      }
      if (reveal < 1) reveal = Math.min(1, reveal + dt / 1.8);
      draw();
      if (!motion.paused || reveal < 1) raf = requestAnimationFrame(tick);
    }
    function start() {
      if (lost || document.hidden || raf) return;
      previous = null;
      raf = requestAnimationFrame(tick);
    }

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0;
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    document.addEventListener('visibilitychange', start);
    window.addEventListener('resize', () => { resize(); draw(); start(); }, { passive: true });
    motion.listeners.push(paused => { if (!paused) start(); });
    resize();
    draw();
    start();
  })();

  /* ------------------------------------------------------------------ */
  /* Luminous Prism                                                      */
  /* ------------------------------------------------------------------ */
  (() => {
    // Original Prism ray-marching shader and utility functions are retained below.
    const INTRO_SECONDS = 1.4;
    const PALETTE_SIZE = 64;
    const HUE_W = [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114];
    const HUE_U = [0.701, -0.587, -0.114, -0.299, 0.413, -0.114, -0.3, -0.588, 0.886];
    const HUE_V = [0.168, -0.331, 0.5, 0.328, 0.035, -0.5, -0.497, 0.296, 0.201];

    const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

    const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform mat3 uRay;
uniform float uGlow;
uniform vec2 uOffset;
uniform float uColorFreq;
uniform float uCenterShift;
uniform float uInvBaseHalf;
uniform float uInvHeight;
uniform float uMinAxis;
uniform float uPxScale;
uniform sampler2D uPalette;
uniform int uUsePalette;
uniform float uTime;
uniform float uNoise;
uniform float uSaturation;
uniform mat3 uHue;
uniform int uUseHue;
uniform float uLight;
uniform float uNeutral;
out vec4 outColor;

const vec4 PHASE_COS = vec4(1.0, 0.5403023058681398, -0.4161468365471424, -0.9899924966004454);
const vec4 PHASE_SIN = vec4(0.0, 0.8414709848078965, 0.9092974268256817, 0.1411200080598672);

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);
}

float pyramid(vec3 p) {
  vec3 q = vec3(abs(p.x) * uInvBaseHalf, abs(p.y) * uInvHeight, abs(p.z) * uInvBaseHalf);
  return max((q.x + q.y + q.z - 1.0) * uMinAxis * 0.5773502691896258, -p.y);
}

vec3 grade(vec3 col, vec2 seed) {
  col += (rand(seed) - 0.5) * uNoise;
  col = clamp(col, 0.0, 1.0);
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = clamp(mix(vec3(L), col, uSaturation), 0.0, 1.0);
  if (uUseHue == 1) col = clamp(uHue * col, 0.0, 1.0);
  return col;
}

void main() {
  vec2 f = (gl_FragCoord.xy - 0.5 * uResolution - uOffset) * uPxScale;
  vec3 origin = uRay * vec3(f, 0.0);
  vec3 axis = uRay[2];
  float z = 5.0;
  vec4 o = vec4(0.0);
  for (int i = 0; i < 100; i++) {
    vec3 p = origin + axis * z;
    float d = 0.1 + 0.2 * abs(pyramid(p + vec3(0.0, uCenterShift, 0.0)));
    z -= d;
    float phase = (p.y + z) * uColorFreq;
    vec4 band = sin(phase) * PHASE_COS + cos(phase) * PHASE_SIN + 1.0;
    if (uUsePalette == 1) band.rgb = texture(uPalette, vec2(phase * 0.15915494309189535, 0.5)).rgb * 2.0;
    o += band / d;
  }
  vec4 raw = o * o * uGlow / 1e5;
  vec4 e = exp(2.0 * raw);
  vec4 mapped = (e - 1.0) / (e + 1.0);
  vec2 seed = gl_FragCoord.xy + vec2(uTime);
  if (uLight > 0.5) {
    float peak = max(raw.r, max(raw.g, raw.b));
    vec3 hue = grade(raw.rgb / max(peak, 1e-6), seed);
    vec3 ink = pow(hue, vec3(1.5)) * mix(0.86, 0.32, uNeutral);
    float strength = max(mapped.r, max(mapped.g, mapped.b)) * mapped.a;
    float cover = clamp(strength * 0.95 + (rand(seed.yx) - 0.5) * uNoise * 0.5, 0.0, 1.0);
    outColor = vec4(ink * cover, cover);
  } else {
    outColor = vec4(grade(mapped.rgb, seed) * mapped.a, mapped.a);
  }
}`;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const compile = (gl, type, source) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    };

    const link = gl => {
      const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      const program = gl.createProgram();
      if (!vertex || !fragment || !program) return null;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
      }
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
      }
      return { program, uniforms };
    };

    const rotation = (yaw, pitch, roll) => {
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cx = Math.cos(pitch);
      const sx = Math.sin(pitch);
      const cz = Math.cos(roll);
      const sz = Math.sin(roll);
      return [
        cy * cz + sy * sx * sz,
        cx * sz,
        -sy * cz + cy * sx * sz,
        -cy * sz + sy * sx * cz,
        cx * cz,
        sy * sz + cy * sx * cz,
        sy * cx,
        -sx,
        cy * cx
      ];
    };

    const multiply = (a, b) => {
      const out = new Array(9);
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
          out[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
        }
      }
      return out;
    };

    const canvas = document.getElementById('prism');
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', {
      alpha:true, premultipliedAlpha:true, antialias:false, depth:false, stencil:false,
      powerPreference:'high-performance'
    });
    if (!gl) { canvas.style.display = 'none'; return; }

    // The source's default prism proportions, rotation and timing are retained.
    // Themed palette; mouse interactivity remains disabled.
    const settings = {
      height:3.5, baseWidth:5.5, animationType:'rotate', glow:1,
      offsetX:0, offsetY:0, noise:0, scale:3.6, hueShift:0,
      colorFrequency:1, colors:theme.prism,
      saturation:1.5, timeScale:0.1,
      interactive:false, intro:true, resolution:0.5, lightMode:false
    };

    const programInfo = link(gl);
    if (!programInfo) { canvas.style.display = 'none'; return; }
    const { program, uniforms:u } = programInfo;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const paletteTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,PALETTE_SIZE,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);

    const probe = document.createElement('canvas').getContext('2d',{willReadFrequently:true});
    function parse(value){
      if(!probe) return [255,255,255];
      probe.clearRect(0,0,1,1);
      probe.fillStyle='#000000'; probe.fillStyle=String(value);
      probe.fillRect(0,0,1,1);
      const [r,g,b] = probe.getImageData(0,0,1,1).data;
      return [r,g,b];
    }
    function makePalette(colorsList){
      const stops=colorsList.map(parse);
      const data=new Uint8Array(PALETTE_SIZE*4);
      for(let i=0;i<PALETTE_SIZE;i++){
        const position=(i/PALETTE_SIZE)*stops.length;
        const index=Math.floor(position);
        const a=stops[index%stops.length];
        const b=stops[(index+1)%stops.length];
        const t=position-index;
        const k=t*t*(3-2*t);
        for(let c=0;c<3;c++) data[i*4+c]=Math.round(a[c]+(b[c]-a[c])*k);
        data[i*4+3]=255;
      }
      gl.bindTexture(gl.TEXTURE_2D,paletteTexture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,PALETTE_SIZE,1,gl.RGBA,gl.UNSIGNED_BYTE,data);
      return 1-stops.reduce((sum,[r,g,b])=>{
        const top=Math.max(r,g,b);
        return sum+(top>0 ? (top-Math.min(r,g,b))/top : 0);
      },0)/stops.length;
    }
    const neutral=makePalette(settings.colors);
    const view={width:1,height:1,scale:1};
    let time=0;
    let introClock=settings.intro && !motion.paused ? 0 : 1;
    let previous=null,raf=0;

    function orientation(){
      const tilt=rotation(0,0,0);
      const t=time*settings.timeScale;
      const c0=Math.cos(t), c1=Math.cos(t+33), c2=Math.cos(t+11);
      return multiply(tilt,[c0,0,c2,0,1,0,c1,0,c0]);
    }
    function draw(){
      const s=settings;
      const half=s.baseWidth*0.5;
      const ignite=introClock*introClock*(3-2*introClock);
      const c=Math.cos(s.hueShift), sn=Math.sin(s.hueShift);
      gl.bindVertexArray(vao);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.useProgram(program);
      gl.uniform2f(u.uResolution,canvas.width,canvas.height);
      gl.uniformMatrix3fv(u.uRay,false,orientation());
      gl.uniform1f(u.uGlow,s.glow*ignite*ignite);
      gl.uniform2f(u.uOffset,s.offsetX*view.scale,-s.offsetY*view.scale);
      gl.uniform1f(u.uColorFreq,s.colorFrequency);
      gl.uniform1f(u.uCenterShift,s.height*0.25);
      gl.uniform1f(u.uInvBaseHalf,1/half);
      gl.uniform1f(u.uInvHeight,1/s.height);
      gl.uniform1f(u.uMinAxis,Math.min(half,s.height));
      gl.uniform1f(u.uPxScale,1/(canvas.height*0.1*s.scale));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,paletteTexture);
      gl.uniform1i(u.uPalette,0);
      gl.uniform1i(u.uUsePalette,1);
      gl.uniform1f(u.uTime,time);
      gl.uniform1f(u.uNoise,s.noise);
      gl.uniform1f(u.uSaturation,s.saturation);
      gl.uniformMatrix3fv(u.uHue,false,HUE_W.map((w,i)=>w+HUE_U[i]*c+HUE_V[i]*sn));
      gl.uniform1i(u.uUseHue,Math.abs(s.hueShift)>0.0001?1:0);
      gl.uniform1f(u.uLight,s.lightMode?1:0);
      gl.uniform1f(u.uNeutral,neutral);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    function resize(){
      view.width=Math.max(1,window.innerWidth);
      view.height=Math.max(1,window.innerHeight);
      view.scale=Math.min(window.devicePixelRatio||1,2)*settings.resolution;
      canvas.width=Math.max(1,Math.round(view.width*view.scale));
      canvas.height=Math.max(1,Math.round(view.height*view.scale));
      draw();
    }
    function frame(now){
      raf=0;
      if(previous===null) previous=now;
      const dt=clamp((now-previous)/1000,0,0.05);
      previous=now;
      if (!document.hidden) {
        if(!motion.paused) time+=dt;
        if(introClock<1) introClock=Math.min(1,introClock+dt/INTRO_SECONDS);
        draw();
      }
      if(!motion.paused || introClock<1) raf=requestAnimationFrame(frame);
    }
    function start(){
      if(raf) return;
      previous=null;
      raf=requestAnimationFrame(frame);
    }
    window.addEventListener('resize',resize,{passive:true});
    document.addEventListener('visibilitychange',()=>{previous=null;});
    motion.listeners.push(paused => { if (!paused) start(); });
    resize();
    start();
  })();
})();
