// AI-assisted: Used Claude to design and write this WebGL light-wave shader.
"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Light waves: wide plates of glass pouring out from under the wordmark toward the viewer.
 *
 * The fan starts exactly as wide as the title (measured from the DOM, so it follows any font or
 * screen), with a shaft of light under each letter. From there the plates bell outward. Each plate
 * is translucent: soft shoulders, a rainbow gradient across its width, a glow that spills onto its
 * neighbours (cheap blur taps that widen with distance), and slow swells of light travelling
 * toward the camera in perspective.
 *
 * Raw WebGL 1, one full-screen triangle. Plays an intro on mount (light pours out of the letters,
 * the camera eases back), speeds up as the page scrolls, pauses off screen, one still frame for
 * reduced motion.
 */

const NL = 24; // plates across the fan
const LETTERS = 6;

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;      // flow clock (speeds up while scrolling)
uniform vec2 uMouse;
uniform float uIntro;     // 0..1
uniform float uDive;      // 0..1 scroll
uniform vec3 uAnchor;     // x, y of the apex in uv; half-width of the title in height units
uniform float uLetter[${LETTERS}];  // letter centres across the fan, -1..1
uniform float uEdge[${NL + 1}];     // plate edges, 0..1

const int NL = ${NL};

float hash(float n) { return fract(sin(n * 127.1 + 11.7) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Rainbow without the chartreuse: green is held back so it reads gold, teal and blue like glass dispersion
vec3 pal(float t) {
  vec3 c = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  c.g = pow(c.g, 1.5) * 0.92;
  return c;
}

// One slice across the fan at depth dd: which plate, how it is lit.
vec3 shade(float u, float dd, float t, float Wpx) {
  float x = clamp(u * 0.5 + 0.5, 0.0, 0.9999);
  float lo = 0.0, hi = 1.0, id = 0.0;
  for (int i = 0; i < NL; i++) {
    float e0 = uEdge[i];
    if (x >= e0) { id = float(i); lo = e0; hi = uEdge[i + 1]; }
  }
  float f = (x - lo) / max(hi - lo, 0.00001);
  float g = f * 2.0 - 1.0;                       // -1..1 across the plate
  float h1 = hash(id + 0.5);
  float h2 = hash(id + 41.0);
  float h3 = hash(id + 87.0);

  float lanePx = max((hi - lo) * 2.0 * Wpx, 0.001);
  float aa = 1.3 / lanePx;
  // Translucent: soft shoulders and a faint glow in the seams, not black gaps
  float edge = smoothstep(0.0, 0.07 + aa, f) * smoothstep(1.0, 0.93 - aa, f);
  float body = mix(0.04, 1.0, edge);

  float core = exp(-u * u * 7.0) * exp(-dd * 2.4);                // white gold, top centre
  float lit = max(0.06 + 0.94 * smoothstep(0.38, 0.78, h1 + 0.25 * smoothstep(0.0, 0.8, u)), core * 0.9);
  float dpeak = mix(0.02, 0.95, pow(abs(u), 0.8)) + (h3 - 0.5) * 0.3;   // outer plates peak further down
  float env = exp(-pow((dd - dpeak) / (0.5 + 0.4 * h2), 2.0)) * 0.9 + 0.1;
  float bp = (h2 * 2.0 - 1.0) * 0.6;
  float prof = exp(-pow((g - bp) / (0.25 + 0.30 * h3), 2.0));     // bright band across the plate
  float broad = exp(-pow((g - bp) / 1.0, 2.0));                    // the plate's overall glow

  // Slow swells of light travelling toward the viewer, in perspective
  float qd = 1.0 / (dd + 0.25);
  float pulse = 0.5 + 0.5 * sin(6.28318 * (qd * 0.9 + t * (0.26 + 0.30 * h3) + h2 * 7.0));
  pulse *= pulse;

  // Dispersion: hue slides across the width of a plate and along its bend
  vec3 sp = pal(h2 * 1.2 + g * 0.40 + dd * 0.8 + u * 0.25);
  vec3 warm = vec3(1.0, 0.86, 0.60);
  float whiten = clamp(smoothstep(-0.2, 0.8, u) * 0.45 + core * 0.95, 0.0, 1.0);
  vec3 tint = mix(sp * 1.3, warm * 1.6, whiten);

  vec3 base = mix(vec3(0.040, 0.024, 0.022), vec3(0.105, 0.055, 0.100), f) * (0.5 + 0.8 * broad);
  float L = lit * env * (0.28 * broad + 1.7 * prof) * (0.40 + 0.9 * pulse);
  vec3 c = base + tint * L;
  c += warm * pow(clamp(prof * env * lit, 0.0, 1.0), 3.0) * 0.7;          // hot centre of a band
  float rim = pow(abs(g), 5.0) * (0.08 + 0.7 * lit * env);                // soft rainbow at the bevel
  c += pal(h1 * 3.0 + dd * 1.2 + g * 0.35) * rim * 0.7;
  c *= body;
  c *= 1.0 - 0.2 * smoothstep(0.75, 1.4, dd);
  return c;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float aspect = uRes.x / uRes.y;
  float t = uTime;

  float intro = uIntro;
  float zoom = mix(1.32, 1.0, intro * intro * (3.0 - 2.0 * intro));

  // Scene space: height units, origin at the apex, down is "toward the viewer"
  vec2 c = (uv - uAnchor.xy) / zoom;
  vec2 p = vec2(c.x * aspect, c.y);
  float d = -c.y / uAnchor.y;
  float dd = max(d, 0.0);

  // The fan starts as wide as the title, then bells out hard
  float s = pow(clamp(aspect / 0.75, 1.0, 2.6), 0.78);
  float W = uAnchor.z + s * 1.22 * pow(dd, 2.1);
  p.x -= (uMouse.x - 0.5) * 0.07 * dd;
  p.x += 0.010 * sin(dd * 5.0 - t * 0.5) * dd;
  float u = p.x / W;
  float Wpx = W * uRes.y;

  // ---- Background: pure black, so the light is the only thing on the stage ----
  vec3 bg = vec3(0.0);

  // ---- The plates, with a glow that spills sideways and widens with distance ----
  float blurPx = mix(0.8, 11.0, smoothstep(0.0, 0.55, dd));
  float du = blurPx / max(Wpx, 1.0);
  vec3 sharp = shade(u, dd, t, Wpx);
  vec3 glow = (shade(u - du, dd, t, Wpx) + shade(u + du, dd, t, Wpx)
             + shade(u - 2.6 * du, dd, t, Wpx) + shade(u + 2.6 * du, dd, t, Wpx)) * 0.25;
  vec3 rib = mix(sharp, glow, 0.24) + glow * 0.16;

  // A shaft of light under every letter, merging into the plates as it falls
  vec3 warm = vec3(1.0, 0.86, 0.60);
  float shaft = 0.0;
  for (int k = 0; k < ${LETTERS}; k++) shaft += exp(-pow((u - uLetter[k]) / 0.085, 2.0));
  rib += warm * (0.25 + 1.15 * shaft) * exp(-dd * 5.5) * 0.85;
  rib += warm * 1.1 * exp(-u * u * 10.0) * exp(-dd * 3.0);

  float inFan = 1.0 - smoothstep(0.975, 1.0, abs(u));
  float below = smoothstep(0.0, 0.11, d);                           // no hard top edge under the word
  float r = 1.4 * (1.0 - pow(1.0 - intro, 2.4));
  float emerge = 1.0 - smoothstep(r - 0.35, r, d);                  // light pours out of the letters
  vec3 col = mix(bg, rib, inFan * below * emerge);

  col *= 1.0 - 0.55 * uDive;

  float expo = 0.25 + 0.95 * smoothstep(0.0, 0.7, intro);
  col = 1.0 - exp(-col * 1.2 * expo);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = clamp(mix(vec3(lum), col, 1.38), 0.0, 1.0);

  vec2 vv = uv - 0.5;
  col *= 1.0 - 0.5 * dot(vv, vv) * 1.6;
  col += (hash2(frag + fract(t)) - 0.5) * 0.022;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("[light-waves]", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/** Plate widths: mostly slim, a few broad sheets. Same recipe every load, so the picture is stable. */
function plateEdges() {
  const widths: number[] = [];
  for (let i = 0; i < NL; i++) {
    const h = Math.abs((Math.sin((i + 3) * 127.1 + 11.7) * 43758.5453) % 1);
    widths.push(0.55 + 2.5 * h * h * h);
  }
  const total = widths.reduce((a, b) => a + b, 0);
  const edges = new Float32Array(NL + 1);
  let acc = 0;
  for (let i = 0; i < NL; i++) {
    edges[i] = acc / total;
    acc += widths[i];
  }
  edges[NL] = 1.0001;
  return edges;
}

const INTRO_MS = 4200;

export function LightWaves({ className, apex = 0.76 }: { className?: string; apex?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) {
      canvas.style.display = "none";
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
    const uIntro = gl.getUniformLocation(prog, "uIntro");
    const uDive = gl.getUniformLocation(prog, "uDive");
    const uAnchor = gl.getUniformLocation(prog, "uAnchor");
    const uLetter = gl.getUniformLocation(prog, "uLetter");
    gl.uniform1fv(gl.getUniformLocation(prog, "uEdge"), plateEdges());

    const title = parent.querySelector<HTMLElement>("[data-title]");
    const letterEls = Array.from(parent.querySelectorAll<HTMLElement>("[data-letter]"));
    // Where the letters sit, measured from layout (offsets ignore the entrance transform)
    const anchor = { x: 0.5, y: apex - 0.02, half: 0.1 };
    const letters = new Float32Array(LETTERS);
    for (let i = 0; i < LETTERS; i++) letters[i] = -1 + (2 * (i + 0.5)) / LETTERS;

    function offsetIn(el: HTMLElement, root: HTMLElement) {
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== root) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      return { x, y };
    }

    function measure() {
      if (!parent || !title) return;
      const W = parent.clientWidth;
      const H = parent.clientHeight;
      if (!W || !H) return;
      const fs = parseFloat(getComputedStyle(title).fontSize) || 24;
      const pad = fs * 0.13; // the trailing letter-space and its balancing padding
      const o = offsetIn(title, parent);
      const visible = Math.max(title.offsetWidth - 2 * pad, 10);
      const cx = o.x + title.offsetWidth / 2;
      anchor.x = cx / W;
      anchor.y = 1 - (o.y + title.offsetHeight + fs * 0.2) / H; // the plates start below the word, descender included
      anchor.half = visible / 2 / H;
      letterEls.slice(0, LETTERS).forEach((el, i) => {
        const lo = offsetIn(el, parent);
        const centre = lo.x + (el.offsetWidth - pad) / 2;
        letters[i] = (centre - cx) / (visible / 2);
      });
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let prev = 0;
    let visible = true;
    let flow = reduce ? 14 : 0;
    let dive = 0;
    let diveTarget = 0;
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    // When the eye loader is up, the light waits and pours out as the eye opens
    let start = document.querySelector(".eye-loader:not(.eye-opening)") ? Infinity : performance.now();
    const onEye = () => {
      start = performance.now();
    };

    function resize() {
      if (!canvas || !parent || !gl) return;
      const r = parent.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(r.width * scale));
      canvas.height = Math.max(1, Math.round(r.height * scale));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
      measure();
    }

    function draw(intro: number) {
      if (!gl || !canvas) return;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, flow);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uIntro, intro);
      gl.uniform1f(uDive, dive);
      gl.uniform3f(uAnchor, anchor.x, anchor.y, anchor.half);
      gl.uniform1fv(uLetter, letters);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible) {
        prev = now;
        return;
      }
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      dive += (diveTarget - dive) * 0.08;
      flow += dt * (1 + 5 * dive); // scrolling rushes the waves toward you
      draw(Math.max(Math.min((now - start) / INTRO_MS, 1), 0));
    }

    function onMove(e: PointerEvent) {
      const r = parent!.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width;
      mouse.ty = 1 - (e.clientY - r.top) / r.height;
    }
    function onScroll() {
      diveTarget = Math.min(Math.max(window.scrollY / (window.innerHeight * 0.9), 0), 1);
    }

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(1);
    });
    ro.observe(parent);
    if (title) ro.observe(title);
    // The wordmark font arrives after first paint: re-measure so the fan matches the real letters
    document.fonts?.ready.then(() => {
      measure();
      if (reduce) draw(1);
    });
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));

    if (reduce) {
      draw(1);
    } else {
      io.observe(canvas);
      window.addEventListener("enigma:eye-open", onEye, { once: true });
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("enigma:eye-open", onEye);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [apex]);

  return <canvas ref={ref} aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)} />;
}
