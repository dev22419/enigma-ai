// AI-assisted: Used Claude to design and write this WebGL loader.
"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The opening of the landing page: an eye inside hatched ribbons of light. It opens, blinks twice,
 * then the lids keep going past the edges of the screen, and the page is what you see through it.
 *
 * Raw WebGL 1, one full-screen triangle, drawn with alpha so the opening is a real hole in the
 * overlay. A click or a key skips to the opening. Plays on a full page load only.
 */

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLid;     // 0 shut, 1 open, more while the page opens
uniform float uZoom;
uniform float uInner;   // the inside of the eye: 1 black, 0 a hole through to the page
uniform float uRibbon;  // ribbons growing in
uniform float uFade;

const vec3 TEAL = vec3(0.21, 0.72, 0.68);
const vec3 VIOLET = vec3(0.36, 0.25, 0.76);
const vec3 MAGENTA = vec3(0.86, 0.22, 0.70);
const vec3 CHAMPAGNE = vec3(0.96, 0.87, 0.70);

vec3 pal(float t) {
  float x = fract(t) * 4.0;
  if (x < 1.0) return mix(TEAL, VIOLET, x);
  if (x < 2.0) return mix(VIOLET, MAGENTA, x - 1.0);
  if (x < 3.0) return mix(MAGENTA, CHAMPAGNE, x - 2.0);
  return mix(CHAMPAGNE, TEAL, x - 3.0);
}

// Above zero inside the lids
float almond(vec2 p) {
  float x = abs(p.x) / 0.3;
  if (x >= 1.0) return -1.0;
  return 0.118 * uLid * pow(1.0 - x * x, 1.25) - abs(p.y);
}

void main() {
  float unit = min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / unit * 1.22 / uZoom;
  float aa = 1.8 / unit / uZoom;
  float r = length(p);
  float a = atan(p.y, p.x);

  // Ribbons: closed loops that twist, so each one swells and pinches on its way round
  // The iris fills the middle, so the black of the eye reads as a shape cut out of the light
  float irisEdge = 0.205 + 0.012 * sin(a * 5.0 + uTime * 0.8);
  float iris = (1.0 - smoothstep(irisEdge - aa, irisEdge + aa, r)) * uRibbon;
  float spokes = smoothstep(-0.2, 0.6, sin(a * 340.0 + r * 40.0));
  vec3 col = pal(a / 6.28318 * 2.0 + 0.58 + r * 2.4 - uTime * 0.04) * iris * spokes * (0.45 + 0.75 * smoothstep(0.08, 0.2, r));
  for (int i = 0; i < 7; i++) {
    float f = float(i);
    float dir = mod(f, 2.0) * 2.0 - 1.0;
    float ph = f * 1.7 + dir * uTime * (0.32 + 0.07 * f);
    float centre = 0.225 + 0.03 * f + 0.05 * sin(3.0 * a + ph) + 0.028 * sin(2.0 * a - ph * 1.3 + f);
    float w = (0.012 + 0.07 * pow(0.5 + 0.5 * sin(2.0 * a + ph * 0.7 + f * 2.1), 2.0)) * uRibbon;
    float off = r - centre;
    float d = abs(off);
    float body = 1.0 - smoothstep(w - aa, w + aa, d);
    float hatch = smoothstep(-0.25, 0.5, sin(a * 340.0 + off * 90.0 + f * 1.3));
    float bevel = 0.5 + 0.5 * cos(clamp(d / max(w, 0.0001), 0.0, 1.0) * 1.57);
    col += pal(a / 6.28318 + f * 0.17 + off * 3.0 + uTime * 0.05) * body * hatch * bevel;
  }
  col = 1.0 - exp(-col * 1.15);

  // A thin dark line keeps the lids crisp against the light
  float inside = smoothstep(-aa, aa, almond(p));
  col *= 1.0 - smoothstep(-0.012 - aa, -0.012 + aa, almond(p));

  // The pupil, with a little of the same hatching at its edge
  float rim = 0.058 + 0.0035 * sin(a * 60.0);
  float pupil = (1.0 - smoothstep(rim - aa, rim + aa, r)) * inside * uInner;
  col = mix(col, CHAMPAGNE * uInner, pupil);

  float alpha = mix(1.0, uInner, inside) * uFade;
  gl_FragColor = vec4(col * uFade, alpha);
}
`;

// Seconds
const OPENING = 1.95; // the blinking stops and the page starts to open
const END = 2.95;

/** The lids, as [time, how open]: opens, blinks, blinks again. */
const LIDS = [
  [0.35, 0],
  [0.75, 1],
  [1.05, 1],
  [1.17, 0.04],
  [1.33, 1],
  [1.6, 1],
  [1.7, 0.04],
  [1.86, 1],
];

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const ease = (x: number) => x * x * (3 - 2 * x);

function lidAt(t: number) {
  if (t <= LIDS[0][0]) return 0;
  for (let i = 1; i < LIDS.length; i++) {
    const [t1, v1] = LIDS[i];
    if (t <= t1) {
      const [t0, v0] = LIDS[i - 1];
      return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
    }
  }
  return 1;
}

let played = false; // Once a page load, so coming back from the app doesn't replay it

export function EyeLoader() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [opening, setOpening] = useState(false);
  const [done, setDone] = useState(played);

  useEffect(() => {
    if (played) return;
    let raf = 0;
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      setOpening(true);
      window.dispatchEvent(new Event("enigma:eye-open"));
    };
    const finish = () => {
      played = true;
      open();
      setDone(true);
    };

    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true });
    if (!canvas || !gl || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(finish);
      return () => cancelAnimationFrame(raf);
    }

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      raf = requestAnimationFrame(finish);
      return () => cancelAnimationFrame(raf);
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u("uRes");
    const uTime = u("uTime");
    const uLid = u("uLid");
    const uZoom = u("uZoom");
    const uInner = u("uInner");
    const uRibbon = u("uRibbon");
    const uFade = u("uFade");

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(window.innerWidth * scale);
      canvas.height = Math.round(window.innerHeight * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let t0 = performance.now();
    const skip = () => {
      const t = (performance.now() - t0) / 1000;
      if (t < OPENING) t0 -= (OPENING - t) * 1000;
    };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= END) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
      const go = clamp01((t - OPENING) / (END - OPENING));
      if (go > 0) open();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uLid, lidAt(t) * (1 + 0.5 * ease(clamp01(go * 3))));
      gl.uniform1f(uZoom, 1 + 22 * go * go * go);
      gl.uniform1f(uInner, 1 - ease(clamp01(go * 5)));
      gl.uniform1f(uRibbon, ease(clamp01(t / 0.8)));
      gl.uniform1f(uFade, 1 - ease(clamp01((go - 0.75) * 4)));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  if (done) return null;
  return (
    <div aria-hidden="true" className={cn("eye-loader fixed inset-0 z-[100]", opening ? "eye-opening" : "bg-black")}>
      <canvas ref={ref} className="absolute inset-0 size-full" />
      <noscript>
        <style>{`.eye-loader { display: none; }`}</style>
      </noscript>
    </div>
  );
}
