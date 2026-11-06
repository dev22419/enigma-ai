// AI-assisted: Used Claude to port the liquid glass nav kit to React.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#route", label: "How it works" },
  { href: "#lifespan", label: "Lifespan" },
  { href: "#certificate", label: "Receipts" },
  { href: "#api", label: "API" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* A rotor: three offset rings, after the cipher machine the name comes from */}
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
        <circle cx="11" cy="11" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.8" />
        <circle cx="11" cy="11" r="2" fill="var(--orchid)" />
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.01em]">Enigma</span>
    </span>
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Signed distance to a capsule. */
function sd(x: number, y: number, hx: number, hy: number, r: number) {
  const qx = Math.abs(x) - hx + r;
  const qy = Math.abs(y) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Displacement map of a capsule with a bevelled rim. */
function lensMap(w: number, h: number, r: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const hx = w / 2;
  const hy = h / 2;
  const bevel = r * 0.55;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hx;
      const py = y + 0.5 - hy;
      const d = sd(px, py, hx, hy, r);
      const gx = sd(px + 1, py, hx, hy, r) - sd(px - 1, py, hx, hy, r);
      const gy = sd(px, py + 1, hx, hy, r) - sd(px, py - 1, hx, hy, r);
      const len = Math.hypot(gx, gy) || 1;
      const bend = Math.min(1, Math.max(0, 1 + d / bevel)) ** 3;
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(127.5 - (gx / len) * bend * 127.5);
      img.data[i + 1] = Math.round(127.5 - (gy / len) * bend * 127.5);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function isChromium() {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  return !!brands?.some((b) => /Chromium/.test(b.brand)) || (/Chrome\//.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent));
}

/** Bends what sits behind the bar in Chrome and Edge. Other browsers keep the frosted CSS. */
function useGlassLens(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !isChromium()) return;

    const defs = document.createElementNS(SVG_NS, "svg");
    defs.setAttribute("width", "0");
    defs.setAttribute("height", "0");
    defs.setAttribute("aria-hidden", "true");
    defs.style.position = "absolute";
    document.body.prepend(defs);
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.id = "enigma-nav-lens";
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    defs.appendChild(filter);

    let size = "";
    const apply = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h || size === `${w}x${h}`) return;
      size = `${w}x${h}`;
      const r = Math.min(h / 2, w / 2);
      const k = h / 62; // Tuned for a 62px bar.
      filter.setAttribute("width", String(w));
      filter.setAttribute("height", String(h));
      filter.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${(1.6 * k).toFixed(2)}" result="soft"/>
        <feImage x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map" href="${lensMap(w, h, r)}"/>
        <feDisplacementMap in="soft" in2="map" scale="${(32 * k).toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="dR"/>
        <feDisplacementMap in="soft" in2="map" scale="${(32 * k).toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="dG"/>
        <feDisplacementMap in="soft" in2="map" scale="${(32 * k).toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="dB"/>
        <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
        <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
        <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
        <feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="rgb"/>
        <feColorMatrix in="rgb" type="saturate" values="1.3"/>`;
      el.style.setProperty("backdrop-filter", "url(#enigma-nav-lens)");
      el.style.setProperty("-webkit-backdrop-filter", "url(#enigma-nav-lens)");
      el.classList.add("lens");
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      defs.remove();
      el.style.removeProperty("backdrop-filter");
      el.style.removeProperty("-webkit-backdrop-filter");
      el.classList.remove("lens");
    };
  }, [ref]);
}

/** The selection pill behind the links: a spring that stretches with its speed. */
function useNavPill(holderRef: React.RefObject<HTMLElement | null>, pillRef: React.RefObject<HTMLElement | null>, setActive: (i: number) => void) {
  useEffect(() => {
    const holder = holderRef.current;
    const pill = pillRef.current;
    if (!holder || !pill) return;
    const links = [...holder.querySelectorAll("a")];
    const sections = LINKS.map((l) => document.querySelector(l.href));
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const K = 260;
    const C = 2 * 0.6 * Math.sqrt(K);
    let active = -1;
    let cx = 0;
    let v = 0;
    let tcx = 0;
    let tw = 0;
    let th = 0;
    let raf = 0;
    let last = 0;
    let shown = false;

    const geom = () => {
      const a = links[active];
      if (!a) return false;
      tcx = a.offsetLeft + a.offsetWidth / 2;
      tw = a.offsetWidth;
      th = a.offsetHeight;
      return true;
    };
    const place = () => {
      const a = links[active];
      if (!a) return;
      const s = Math.min(Math.abs(v) / 1400, 0.5);
      const w = tw * (1 + s);
      const h = th * (1 - s * 0.16);
      pill.style.width = `${w}px`;
      pill.style.height = `${h}px`;
      pill.style.transform = `translate(${cx - w / 2}px, ${a.offsetTop + (a.offsetHeight - h) / 2}px)`;
    };
    const step = (t: number) => {
      const dt = Math.min((t - last) / 1000 || 0.016, 1 / 30);
      last = t;
      v += (-K * (cx - tcx) - C * v) * dt;
      cx += v * dt;
      place();
      if (Math.abs(cx - tcx) < 0.2 && Math.abs(v) < 2) {
        cx = tcx;
        v = 0;
        place();
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    const select = (i: number) => {
      if (i === active) return;
      active = i;
      setActive(i);
      if (i < 0) {
        pill.style.opacity = "0";
        shown = false;
        return;
      }
      if (!holder.offsetWidth || !geom()) return;
      if (!shown || reduce) {
        cx = tcx;
        v = 0;
        shown = true;
        place();
        pill.style.opacity = "1";
        return;
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    };

    // Only the sections in the middle of the screen count, so the pill clears over the hero and footer.
    const visible = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const i = sections.indexOf(e.target);
          if (e.isIntersecting) visible.add(i);
          else visible.delete(i);
        });
        select(visible.size ? Math.min(...visible) : -1);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => s && io.observe(s));
    const onResize = () => {
      if (active < 0 || !holder.offsetWidth || !geom()) return;
      cx = tcx;
      v = 0;
      shown = true;
      place();
      pill.style.opacity = "1";
    };
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener("resize", onResize);
    };
  }, [holderRef, pillRef, setActive]);
}

export function SiteNav() {
  const bar = useRef<HTMLElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLElement>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  useGlassLens(bar);
  useNavPill(holder, pill, setActive);

  return (
    <header ref={bar} className="glass-nav">
      <Link href="/" aria-label="Enigma home" className="justify-self-start">
        <Logo />
      </Link>

      <nav ref={holder} className="glass-links" aria-label="Sections">
        <i ref={pill} className="glass-pill" aria-hidden="true" />
        {LINKS.map((l, i) => (
          <a key={l.href} href={l.href} className={cn(active === i && "cur")} aria-current={active === i ? "true" : undefined}>
            {l.label}
          </a>
        ))}
      </nav>

      <div className="glass-right">
        <a className="txt" href="https://github.com/dev22419/enigma-ai">
          GitHub
        </a>
        <Link className="glass-cta" href="/chat">
          Open the app
        </Link>
        <button type="button" className="glass-menu" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <i />
          <i />
        </button>
      </div>

      {open && (
        <div className="glass-sheet">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <a href="https://github.com/dev22419/enigma-ai">GitHub</a>
        </div>
      )}
    </header>
  );
}
