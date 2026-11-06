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

  // ---- Slab geometry -------------------------------------------------------
  // Vertical slabs of thick glass with a hairline gap between them.
  float rib = frag.x / uRib;
  float id = floor(rib);
  float f = fract(rib);
  float gap = 2.2 / uRib;                       // ~2px of dark seam
  float body = smoothstep(0.0, gap, f) * smoothstep(1.0, 1.0 - gap, f);
  float u = (f - 0.5) * 2.0;                     // -1 .. 1 across the slab

  // Flat face with rounded, bevelled edges: the normal only tilts near the sides.
  float tilt = sign(u) * pow(abs(u), 4.0);
  vec3 n = normalize(vec3(tilt * 1.6, 0.0, 1.0));

  // Each slab sits at its own depth, so it shifts a little differently as you move.
  float depth = hash(vec2(id, 7.0));
  float parallax = (uMouse.x - 0.5) * (0.010 + 0.030 * depth) + (depth - 0.5) * 0.012;
  float sway = 0.02 * sin(t * 0.3 + id * 0.37) * (0.4 + depth);

  // ---- Refraction with dispersion -----------------------------------------
  // Light bends at the bevels; red, green and blue bend by slightly different amounts.
  float k = 0.11;
  float bx = uv.x + parallax;
  float by = uv.y + sway * u * u;
  vec2 pr = vec2((bx - n.x * k * 0.92) * aspect, by);
  vec2 pg = vec2((bx - n.x * k * 1.00) * aspect, by);
  vec2 pb = vec2((bx - n.x * k * 1.10) * aspect, by);
  vec3 c = vec3(scene(pr, t, aspect).r, scene(pg, t, aspect).g, scene(pb, t, aspect).b);

  // The glass itself absorbs a little: thicker (darker, cooler) at the bevels.
  float thickness = 1.0 - 0.35 * abs(tilt);
  c *= mix(vec3(0.70, 0.78, 0.86), vec3(1.0), thickness);

  // ---- Light on the glass ---------------------------------------------------
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  // Fresnel: edges reflect more, picking up the light around them
  float fres = pow(abs(tilt), 1.4);
  c += fres * (0.55 * c + 0.10 * vec3(0.85, 0.92, 1.0));

  // A soft glare that follows the pointer across the slabs
  vec3 L = normalize(vec3((uMouse.x - uv.x) * 1.8, 0.0, 0.55));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 140.0);
  float glare = exp(-pow((uv.y - (0.35 + 0.25 * uMouse.y)) * 2.2, 2.0)); // strongest at the pointer's height
  c += spec * (0.35 + 1.4 * lum) * (0.35 + 0.65 * glare) * vec3(1.0, 0.98, 0.96);

  // Bright hairlines where each bevel meets the face, darker one on the far side
  float bevelLit = exp(-pow((f - gap - 0.035) / 0.012, 2.0));
  float bevelDark = exp(-pow((f - (1.0 - gap - 0.03)) / 0.02, 2.0));
  c += bevelLit * (0.08 + 0.9 * lum) * 0.55;
  c *= 1.0 - 0.45 * bevelDark;

  // Seams between slabs: near black, with a faint cold edge
  c = mix(NIGHT * 0.4 + vec3(0.01, 0.025, 0.04) * lum, c, body);

  // A little depth top and bottom
  c *= 0.82 + 0.18 * smoothstep(0.0, 0.25, uv.y) * smoothstep(1.0, 0.8, uv.y);

  // Tone map so the colours run hot without clipping flat, then restore saturation
  c = 1.0 - exp(-c * 1.1);
  float g = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(g), c, 1.3), 0.0, 1.0);
  c += (hash(frag + fract(t)) - 0.5) * 0.03;
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
      // Full device resolution, capped at 2x, so the rib edges stay sharp
      scale = Math.min(window.devicePixelRatio || 1, 2);
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
