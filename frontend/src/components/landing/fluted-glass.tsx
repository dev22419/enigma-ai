// AI-assisted: Used Claude to design and write this WebGL shader background.
"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Fluted glass: light seen through vertical ribbed glass.
 *
 * Behind the glass, blobs of Electric Blue and Cantaloupe drift on Midnight Black, with a bright
 * band where they cross. Each rib refracts the scene (compressing and bending it), and gets its
 * own highlight and shadow, which produces the vertical streaks and curved glints.
 *
 * Raw WebGL 1, one full-screen triangle, rendered below device resolution (the glass blurs it
 * anyway), ~45 fps cap, paused off screen, a single still frame for reduced motion.
 */

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uRib;     // rib width in pixels
uniform float uFocus;   // 0..1, how strongly the light gathers low and centre

const vec3 NIGHT = vec3(0.008, 0.027, 0.039);
const vec3 BLUE  = vec3(0.008, 0.592, 0.871);
const vec3 BLUE2 = vec3(0.10, 0.45, 1.0);
const vec3 MELON = vec3(0.988, 0.451, 0.302);
const vec3 HOT   = vec3(1.0, 0.86, 0.76);

float blob(vec2 p, vec2 c, vec2 r) {
  vec2 d = (p - c) / r;
  return exp(-dot(d, d));
}

// The light behind the glass. p: x scaled by aspect, y in 0..1 (0 = bottom).
vec3 scene(vec2 p, float t, float aspect) {
  vec2 m = uMouse * vec2(aspect, 1.0);
  vec3 col = NIGHT;

  // Electric blue: a tall column of light, drifting and leaning toward the pointer
  vec2 cb = vec2(aspect * (0.30 + 0.10 * sin(t * 0.21)) + (m.x - aspect * 0.5) * 0.08, 0.55 + 0.12 * sin(t * 0.17));
  col += BLUE * 1.5 * blob(p, cb, vec2(0.26, 0.62));
  col += BLUE2 * 0.35 * blob(p, cb + vec2(0.25, -0.2), vec2(0.45, 0.45));

  // Cantaloupe: a low, wide glow that breathes
  vec2 cm = vec2(aspect * (0.72 + 0.08 * cos(t * 0.19)) + (m.x - aspect * 0.5) * 0.06, 0.22 + 0.06 * sin(t * 0.23));
  col += MELON * 1.65 * blob(p, cm, vec2(0.34, 0.28));
  col += MELON * 0.45 * blob(p, vec2(aspect * 0.5, -0.08), vec2(aspect * 0.5, 0.18));

  // A flowing S-shaped band of hot light where the two meet
  float wave = p.y - (0.42 + 0.16 * sin(p.x * 2.3 + t * 0.45) + 0.06 * sin(p.x * 5.1 - t * 0.7));
  float band = exp(-wave * wave / 0.0012);
  float bandMask = smoothstep(0.0, 0.35 * aspect, p.x) * smoothstep(aspect, aspect * 0.55, p.x - 0.1);
  col += mix(BLUE * 1.2, HOT, 0.55 + 0.45 * sin(p.x * 1.7 + t * 0.3)) * band * (0.9 + 0.6 * bandMask);

  // Keep the very top dark so the nav and headline sit on black
  col *= mix(1.0, 0.12, smoothstep(0.5, 0.95, p.y) * uFocus);
  return col;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float aspect = uRes.x / uRes.y;
  float t = uTime;

  // Which rib, and where across it (0..1)
  float rib = frag.x / uRib;
  float id = floor(rib);
  float f = fract(rib);
  float lens = f - 0.5;

  // Refraction: each rib shows a squeezed, mirrored slice of what is behind it, bent vertically
  float jitter = hash(vec2(id, 1.0)) - 0.5;
  float sx = (id + 0.5 - lens * 2.4) * uRib / uRes.x;
  float sy = uv.y + lens * lens * 0.55 * sin(t * 0.35 + id * 0.21) + lens * 0.06 * jitter;
  vec3 c = scene(vec2(sx * aspect, sy), t, aspect);

  // Rib shading: soft dark seams, a lit side and a sharp glint
  float seam = smoothstep(0.0, 0.14, f) * smoothstep(1.0, 0.82, f);
  float lit = 0.35 + 0.85 * smoothstep(0.95, 0.12, f);
  float glint = pow(max(0.0, 1.0 - abs(f - 0.2) * 9.0), 4.0);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = c * lit * (0.15 + 0.85 * seam) + glint * (0.9 * c + 0.35 * lum);

  // Tone map so the colours run hot without clipping flat
  c = 1.0 - exp(-c * 1.05);
  // Push saturation back up after tone mapping
  float g = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(g), c, 1.25), 0.0, 1.0);
  // Fine grain
  c += (hash(frag + fract(t)) - 0.5) * 0.035;
  gl_FragColor = vec4(c, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("[fluted-glass]", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function FlutedGlass({ className, rib = 34, focus = 1 }: { className?: string; rib?: number; focus?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) {
      canvas.style.display = "none"; // the CSS .aurora behind it stays as the fallback
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      canvas.style.display = "none";
      return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uRib = gl.getUniformLocation(prog, "uRib");
    const uFocus = gl.getUniformLocation(prog, "uFocus");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scale = 1;
    let raf = 0;
    let last = 0;
    let visible = true;
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const t0 = performance.now();

    function resize() {
      if (!canvas || !parent || !gl) return;
      const r = parent.getBoundingClientRect();
      // Below device resolution: the glass blurs everything anyway, and it keeps the GPU cool
      scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
      canvas.width = Math.max(1, Math.round(r.width * scale));
      canvas.height = Math.max(1, Math.round(r.height * scale));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function draw(time: number) {
      if (!gl || !canvas) return;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uRib, Math.max(14, rib * scale * (canvas.width < 600 ? 0.75 : 1)));
      gl.uniform1f(uFocus, focus);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < 22) return;
      last = now;
      draw((now - t0) / 1000);
    }

    function onMove(e: PointerEvent) {
      const r = parent!.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width;
      mouse.ty = 1 - (e.clientY - r.top) / r.height;
    }

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(12);
    });
    ro.observe(parent);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));

    if (reduce) {
      draw(12);
    } else {
      io.observe(canvas);
      parent.addEventListener("pointermove", onMove);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      parent.removeEventListener("pointermove", onMove);
      // Free what we made, but keep the context: the canvas (and its context) can be reused on remount.
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [rib, focus]);

  return <canvas ref={ref} aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)} />;
}
