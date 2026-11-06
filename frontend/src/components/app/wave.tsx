// AI-assisted: Used Claude to design and write this WebGL background.
"use client";

import { createContext, useContext, useEffect, useRef } from "react";

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

/**
 * A slow wave of colour rising from the bottom of the panel, in the hero light's colours: charcoal, teal, violet, magenta, orchid, champagne.
 * The colour climbs the sides and sits lower in the middle, and a few sine waves keep the curve moving.
 * uLift pushes the whole wave down, so reading screens keep a dark page with a glow along the bottom.
 */
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLift;

vec3 hex(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

vec3 ramp(float d) {
  vec3 c = hex(28.0, 28.0, 28.0);
  c = mix(c, hex(24.0, 42.0, 48.0), smoothstep(0.05, 0.14, d));
  c = mix(c, hex(36.0, 96.0, 104.0), smoothstep(0.14, 0.26, d));
  c = mix(c, hex(84.0, 62.0, 168.0), smoothstep(0.26, 0.34, d));
  c = mix(c, hex(150.0, 48.0, 190.0), smoothstep(0.34, 0.43, d));
  c = mix(c, hex(200.0, 56.0, 178.0), smoothstep(0.43, 0.49, d));
  c = mix(c, hex(229.0, 156.0, 244.0), smoothstep(0.49, 0.66, d));
  c = mix(c, hex(242.0, 200.0, 248.0), smoothstep(0.66, 0.71, d));
  c = mix(c, hex(244.0, 226.0, 200.0), smoothstep(0.71, 0.77, d));
  c = mix(c, hex(240.0, 214.0, 160.0), smoothstep(0.77, 0.88, d));
  c = mix(c, hex(214.0, 190.0, 120.0), smoothstep(0.88, 1.0, d));
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float y = 1.0 - uv.y;
  float x = (uv.x - 0.5) * 2.0;
  float t = uTime;

  float wave = 0.035 * sin(x * 2.1 + t * 0.55) + 0.022 * sin(x * 4.3 - t * 0.41) + 0.012 * sin(x * 7.7 + t * 0.73);
  float sway = x + 0.07 * sin(t * 0.23);
  float dip = 0.22 * (1.0 - pow(min(abs(sway), 1.0), 1.5));
  // Lower on the page, the colours squeeze together so every one of them still fits
  float squeeze = 1.0 + (1.0 - uLift) * 0.67;
  float d = (y - dip - wave - uLift * 0.44) * squeeze;

  vec3 c = ramp(d);
  gl_FragColor = vec4(c, 1.0);
}
`;

const HOME_LIFT = 0.55; // the colour rises to about the composer
const SCALE = 0.5; // a soft gradient loses nothing at half resolution, and stays cheap
const FRAME_MS = 33;

/** Lets a page ask for the full wave. Everything else gets the low, calm one. */
export const WaveContext = createContext<(full: boolean) => void>(() => undefined);

export function useFullWave(full: boolean) {
  const set = useContext(WaveContext);
  useEffect(() => {
    set(full);
    return () => set(false);
  }, [full, set]);
}

export function Wave({ full }: { full: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef(full ? HOME_LIFT : 1);

  useEffect(() => {
    target.current = full ? HOME_LIFT : 1;
  }, [full]);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!canvas || !gl) return;

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
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uLift = gl.getUniformLocation(prog, "uLift");

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lift = target.current;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();

    const draw = (now: number) => {
      lift += (target.current - lift) * (reduce ? 1 : 0.06);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduce ? 4 : (now - t0) / 1000);
      gl.uniform1f(uLift, lift);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * SCALE));
      canvas.height = Math.max(1, Math.round(r.height * SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);
      draw(performance.now());
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 size-full bg-[#1c1c1c]" aria-hidden="true" />;
}
