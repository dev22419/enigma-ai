# Cinematic hero: context for whoever pulls this branch

Written for Rudra and anyone (or any agent) picking up the landing page after this change. Branch: `feat/cinematic-hero`.

## What changed and why

Dev wanted the landing page to open like a film title: the word Enigma far off at a vanishing point, and wide plates of glass light pouring out of its letters toward the viewer, modelled on a poster reference (a title with a fan of iridescent ribbons). It plays on load, with no click needed.

The old hero (headline, paragraph, buttons, fluted glass background) is gone. The new hero is a full-viewport stage with the light waves, the wordmark, the tagline and the two buttons. The old paragraph and the live job console now sit directly below the stage, so no copy or component was lost.

Everything below the hero is untouched and comes from master as of #53 (Why, Route, SelfDestruct, Certificate, UseCases, ApiSection).

## Files

| File | What it is |
|---|---|
| `frontend/src/components/landing/light-waves.tsx` | New. A raw WebGL1 fragment shader in a client component. This is the whole effect. |
| `frontend/src/components/landing/hero.tsx` | Rewritten. Stage, wordmark, tagline, buttons, credits row, then the old paragraph and `JobConsole`. |
| `frontend/src/app/globals.css` | Appended a block at the end: `.enigma-title`, `.enigma-rise`, `.enigma-tick` and their keyframes. |

Not touched: `site-nav.tsx` and the `.glass-nav` styles, the `/dashboard` ledger, anything under `app/(app)`, `lib/`, API types, `.env`.

## How the effect works

- **The fan is driven by the real title.** `light-waves.tsx` looks inside its parent for `[data-title]` and `[data-letter]` elements (the h1 and one span per letter in `hero.tsx`). It reads their layout with `offsetLeft` and `offsetWidth`, so the fan starts exactly as wide as the word, with a shaft of light under each letter. It re-measures on resize and when the font finishes loading. If you rename those attributes or change the letter count, update `LETTERS` in the shader file.
- **Why the title animation only touches opacity, blur and scale:** the shader measures layout, and transforms do not change `offsetWidth`. Animating `letter-spacing` would make the measurement wrong during the intro.
- **The plates:** 24 translucent glass plates of uneven width, with soft shoulders, a rainbow gradient across each plate, a lit or dark state per plate, and slow swells of light travelling toward the viewer in perspective. Four blur taps that widen with depth give the soft glow. Plate edges are generated once in JS (`plateEdges`) and passed as a uniform.
- **Motion:** a 4.2 second intro (light pours out of the letters while the camera eases back), then a continuous flow. Scrolling speeds the flow up and dims it. The pointer leans the fan slightly.
- **Safety:** pauses when off screen, caps the render scale at 1.5x, shows one still frame for `prefers-reduced-motion`, and hides the canvas (leaving a dark stage) if WebGL or the shader fails.
- **Colour:** rainbow light on pure black, with no background glows and no halo on the wordmark. The landing page is black and grey with one orchid accent (`--orchid`, `#e59cf4`, taken from the app's wave). A gradient at the bottom of the stage blends into the black page below.

## Tuning

All the knobs are in the `FRAG` string in `light-waves.tsx`:

- How wide the fan bells out: `s * 1.22 * pow(dd, 2.1)` where `W` is computed.
- How many plates and how uneven: `NL` and `plateEdges()`.
- How much glow: the `blurPx` range and the `mix(sharp, glow, ...)` line.
- Contrast: the `lit`, `L` and `body` lines, and the saturation pump near the end.
- Intro length: `INTRO_MS`.
- Title size and glow: `.enigma-title` in `globals.css`.

## Known gaps

- Checked in Chrome on desktop only. Phone width has not been looked at, so check it before merging.
- The stage is `h-svh` with a 620px minimum. Very short windows crop the bottom bar.
- No unit tests (it is a visual effect). `npm run build`, `tsc` and `eslint` pass.
- The wordmark uses the same face as the Enigma in the nav. `measure()` follows whatever font loads.
- The shader runs four extra blur taps per pixel. It is fine on a recent laptop. If a low-end device struggles, lower the render scale cap in `resize()` first.

## AI disclosure

Claude Code wrote `light-waves.tsx` and `hero.tsx` under Dev's direction, with Dev comparing screenshots against the reference and asking for changes at each round. The files carry the usual `// AI-assisted` header.
