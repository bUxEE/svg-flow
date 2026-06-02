# svgFlow

> Scroll-animated SVG tube connectors for the web. Connect any DOM elements with glowing, momentum-driven pipeline paths — zero dependencies, framework-agnostic.

**▶ [Live playground](https://buxee.github.io/svg-flow/examples/playground.html)** · [more examples](#examples)

svgFlow injects a full-page SVG overlay behind your content and draws **Manhattan-style routed tubes** between the DOM elements you name. Glowing segments travel along each tube, driven by a scroll-momentum model: scroll down and the flow accelerates, scroll up and it reverses (both behaviours are toggleable via `accelerateOnScroll` / `reverseOnScrollUp`), then it decays back to a gentle drift. Paths re-route automatically when the layout changes, so they work with responsive, relatively-positioned layouts out of the box.

Inspired by the pipeline animation on velocaption.com, rebuilt as a tiny vanilla library.

```
 ┌────────┐        ┌────────┐        ┌────────┐
 │ Source │━━━━━━━▶│ Ingest │━━━━━━━▶│ Output │
 └────────┘        └────────┘        └────────┘
      ╰─ animated segments flow along the tube ─╯
```

---

## Features

- **Zero dependencies.** ~30 KB of ESM, no runtime deps.
- **Framework-agnostic.** Works with plain HTML, React, Vue, Svelte — anything that renders DOM.
- **Multi-element paths.** A single path can chain through any number of elements (`A → B → C → D`), hugging each element's contour on the way.
- **Scroll-momentum animation.** Configurable `baseSpeed`, `scrollMultiplier`, and `friction` produce a physical, springy flow.
- **Layered segments.** Each path stacks 1–N animated segment layers (width, length, gap, color, blur, easing) over a static "tube" track.
- **Per-segment easing.** `linear`, `pulse`, `wave`, `ease-in`, `ease-out`, `ease-in-out`.
- **Responsive.** A `ResizeObserver` re-measures geometry and re-routes paths on any layout change.
- **Respectful defaults.** Pauses when the tab is hidden, honors `prefers-reduced-motion`.
- **SSR-safe.** Throws a clear error if instantiated outside a browser; guard with a client-only mount.

---

## Installation

```bash
npm install @woptima/svg-flow
```

```js
import { SvgFlow } from '@woptima/svg-flow'
```

### CDN (no build step)

The UMD/IIFE build exposes a global named `SvgFlow`, and the class is a property on it:

```html
<script src="https://unpkg.com/@woptima/svg-flow/dist/svgflow.umd.js"></script>
<script>
  // Note: the class is SvgFlow.SvgFlow on the global
  const flow = new SvgFlow.SvgFlow({ /* options */ })
</script>
```

For the native ESM build via CDN:

```html
<script type="module">
  import { SvgFlow } from 'https://unpkg.com/@woptima/svg-flow/dist/svgflow.js'
  new SvgFlow({ /* options */ })
</script>
```

---

## Quick start

Give the elements you want to connect a stable selector (an `id` is simplest), then declare a path that visits them in order:

```html
<div id="node-a">Source</div>
<div id="node-b">Process</div>
<div id="node-c">Output</div>

<script type="module">
  import { SvgFlow } from '@woptima/svg-flow'

  new SvgFlow({
    paths: [
      { elements: ['#node-a', '#node-b', '#node-c'] },
    ],
  })
</script>
```

That's it — the defaults draw a cyan three-layer flow over a dark tube. Everything below is optional tuning.

---

## Concepts

**Path** — one tube that visits an ordered list of `elements`. The router draws a rectilinear (Manhattan) route between consecutive elements, hugging their contours. Entry/exit sides are chosen by a **minimal-traversal** rule: a chain DP picks the sides (and contour wrap direction) for every element that minimise the total path length (contour arcs + obstacle-avoiding bridges). In practice this docks on the nearest facing sides and hops straight between neighbours — no looping the long way around a box. When two consecutive elements sit closer than `nearThreshold` (px), that link is overridden entirely: the pair is joined by a single continuous line between their facing sides at the closest aligned spot (a straight run when they overlap on the cross axis), with no wrapping or hairpin.

**Track** — the static "tube body" drawn under the animation. With `tube: true` it renders as a double stroke (outer + inner color) to fake a 3D pipe.

**Segment** — an animated dashed layer painted over the track. A path stacks several segments with different widths, colors, blur, and speed to build up a rich flow. Each segment is a single `<path>` whose `stroke-dashoffset` is updated every frame.

**Momentum** — one shared animation loop advances every segment. Each frame, scroll delta feeds a `boost` value (scaled by `scrollMultiplier`), `boost` decays by `friction`, and segments move at `baseSpeed + boost` times their per-segment `speedMultiplier`.

---

## API

### `new SvgFlow(options)`

Creates the overlay and starts animating immediately. Returns an instance with the methods below.

### Instance methods

| Method | Description |
|---|---|
| `addPath(config)` | Add a path at runtime. Takes a [`PathConfig`](#pathconfig). |
| `removePath(index)` | Remove the path at the given index (in the order paths were added). |
| `pause()` | Stop the animation loop. |
| `resume()` | Restart the animation loop. |
| `refresh()` | Recompute every path's geometry from the current DOM layout and update the viewBox. Call after moving/resizing connected elements in a way that doesn't change the document size (e.g. dragging an absolutely-positioned node); document-size changes are already handled by the internal `ResizeObserver`. |
| `destroy()` | Remove the SVG overlay, cancel the loop, and detach all listeners. |

> **There is no live `setOptions`.** To change a global option or a segment after construction, call `destroy()` and create a new instance. (The playground does exactly this.)

---

### `SvgFlowOptions`

Global options. Most shape/track/animation fields are **defaults** that each path can override.

| Option | Type | Default | Description |
|---|---|---|---|
| `paths` | `PathConfig[]` | `[]` | The paths to draw. **Required.** |
| `trackStyle` | `TrackStyle` | see below | Default tube appearance for all paths. |
| `segments` | `SegmentConfig[]` | 3-layer cyan preset | Default segment stack for paths that don't specify their own. |
| `cornerStyle` | `'sharp' \| 'rounded' \| 'curved'` | `'rounded'` | Corner treatment at each bend. |
| `cornerRadius` | `number` | `20` | Corner radius in px (for `rounded`/`curved`). |
| `bends` | `'auto' \| number` | `'auto'` | **Reserved.** Routing currently always auto-computes bends; a fixed number is accepted but not yet applied. |
| `contourHug` | `boolean \| number` | `false` | Gap in px between path and element border when wrapping intermediate elements. `true` = 6px. |
| `hugDirection` | `'short' \| 'long'` | `'short'` | Wrap direction around a contoured intermediate. Default (`'short'`) lets the minimal-traversal router pick. `'long'` is an opt-in override that forces the *longer* wrap (hugs more border); element sides stay minimal-path. |
| `nearThreshold` | `number` | `30` | Border-to-border distance (px) below which two consecutive elements are "near". A near pair is connected by a single continuous line between their facing sides at the closest aligned spot — overriding the normal routing for that link (no wrapping/hairpin). Used exactly as given; for a width-derived value compute it yourself. |
| `scrollMultiplier` | `number` | `0.06` | How strongly scroll delta feeds momentum. |
| `friction` | `number` | `0.92` | Momentum decay per frame (lower = snappier stop). |
| `baseSpeed` | `number` | `0.8` | Constant drift speed with no scrolling. |
| `accelerateOnScroll` | `boolean` | `true` | Whether scrolling feeds momentum at all. `false` ignores scroll entirely — the flow runs at `baseSpeed` drift only. Global-only. |
| `reverseOnScrollUp` | `boolean` | `true` | Whether scrolling up reverses the flow. `false` ignores up-scroll, so only downward scroll accelerates and the flow never reverses. Global-only. |
| `zIndex` | `number` | `-1` | Overlay `z-index`. `-1` sits behind page content. |
| `pauseWhenHidden` | `boolean` | `true` | Pause the loop when the tab is hidden. |
| `reducedMotion` | `boolean` | `true` | If the user prefers reduced motion, force `baseSpeed` and `scrollMultiplier` to 0. |
| `scrollContainer` | `HTMLElement \| Window` | `window` | The element whose scroll drives momentum. |

---

### `PathConfig`

One tube. The only required field is `elements`; everything else falls back to the global option of the same name.

| Field | Type | Description |
|---|---|---|
| `elements` | `Array<string \| HTMLElement>` | **Required.** Ordered selectors/refs the path visits. Min 2. |
| `cornerStyle` | `CornerStyle` | Override corner style for this path. |
| `cornerRadius` | `number` | Override corner radius for this path. |
| `bends` | `'auto' \| number` | Reserved (see global note). |
| `contourHug` | `boolean \| number` | Override contour hugging for this path. |
| `hugDirection` | `'short' \| 'long'` | Override hug direction for this path. |
| `nearThreshold` | `number` | Override the near-element direct-hop threshold (px) for this path. |
| `trackStyle` | `Partial<TrackStyle>` | Override tube appearance for this path. |
| `segments` | `SegmentConfig[]` | Override the animated segment stack for this path. |
| `scrollMultiplier` | `number` | Per-path momentum sensitivity. |
| `friction` | `number` | Per-path momentum decay. |
| `baseSpeed` | `number` | Per-path drift speed. |

---

### `TrackStyle`

The static tube drawn under the animation.

| Field | Type | Default | Description |
|---|---|---|---|
| `width` | `number` | `6` | Outer stroke width in px. |
| `color` | `string` | `'#1a1a2e'` | Outer stroke color. **Any CSS color** — pass `rgba()`/`hsla()` for per-color alpha (transparency). |
| `linecap` | `'round' \| 'square' \| 'butt'` | `'round'` | Stroke linecap. |
| `blur` | `number` | `0` | Gaussian blur (glow) on the track. |
| `opacity` | `number` | `1` | Whole-track opacity (multiplies the inner stroke too). For independent outer/inner alpha, use `rgba()` in the colors instead. |
| `tube` | `boolean` | `false` | Draw a second inner stroke to fake a 3D pipe. |
| `innerColor` | `string` | `'#2a2a4e'` | Inner stroke color (when `tube`). **Any CSS color** — pass `rgba()`/`hsla()` for inner alpha. |
| `innerWidth` | `number` | `0` | Inner stroke width (when `tube`). |
| `dashArray` | `[number, number]` | `[0, 0]` | Optional `[dash, gap]` to make the *track* itself dashed. `[0, 0]` = solid. |

> **Color & alpha.** There's no separate alpha field — `color` and `innerColor` take any CSS color string, so set transparency with `rgba(r, g, b, a)` (e.g. `'rgba(156,156,156,0.6)'`). The playground exposes this as separate **Outer color / Outer alpha / Inner color / Inner alpha** controls that it composes into `rgba()` for you.

---

### `SegmentConfig`

One animated layer. Stack several per path for depth.

| Field | Type | Default | Description |
|---|---|---|---|
| `width` | `number` | — | Stroke width in px. |
| `length` | `number` | — | Length of each lit segment (the dash). |
| `gap` | `number` | — | Gap between segments (the space). |
| `color` | `string` | — | Segment color. **Any CSS color** — pass `rgba()`/`hsla()` for per-color alpha. |
| `opacity` | `number` | — | Layer opacity, 0–1 (multiplies with any alpha in `color`). |
| `blur` | `number` | — | Gaussian blur — the glow. `0` = crisp. |
| `linecap` | `'round' \| 'square' \| 'butt'` | `'round'` | Stroke linecap. |
| `speedMultiplier` | `number` | `1.0` | Per-segment speed relative to the path's momentum. |
| `baseSpeedOffset` | `number` | `0` | Constant velocity added to this segment regardless of scroll. |
| `easing` | `SegmentEasing` | `'linear'` | Velocity shaping over time (see below). |
| `wavePeriod` | `number` | — | (`wave`) period of the speed oscillation, in ms. |
| `waveAmplitude` | `number` | — | (`wave`) strength of the oscillation. |
| `pulseOn` | `number` | — | (`pulse`) ms the segment moves. |
| `pulseOff` | `number` | — | (`pulse`) ms the segment pauses. |
| `startOffset` | `number` | `-(pathLength*0.5 + i*150)` | Initial `stroke-dashoffset`. Large negatives phase segments off-screen on load so they enter staggered. |

**Easing modes** (`SegmentEasing`): `linear`, `pulse` (move/pause cycle via `pulseOn`/`pulseOff`), `wave` (sinusoidal speed via `wavePeriod`/`waveAmplitude`), `ease-in`, `ease-out`, `ease-in-out`.

---

## Examples

Try them **live on GitHub Pages** — source for all four is in [`examples/`](https://github.com/bUxEE/svg-flow/tree/main/examples).

- **[▶ Playground](https://buxee.github.io/svg-flow/examples/playground.html)** — interactive editor for every option, with add/remove nodes and live rebuild.
- **[Basic](https://buxee.github.io/svg-flow/examples/basic.html)** — one continuous cyan path through four nodes.
- **[Multi-connection](https://buxee.github.io/svg-flow/examples/multi-connection.html)** — six overlapping multi-color paths, with runtime add/remove/pause controls.
- **[Responsive](https://buxee.github.io/svg-flow/examples/responsive.html)** — a single path through a flexbox layout (no absolute positions). Drag the window edge to watch the tube re-route live.

To run them locally instead (the relative `../dist/svgflow.js` import needs a server):

```bash
# from the repo root
npx serve .
# then visit http://localhost:3000/examples/playground.html
```

### A richer path

```js
new SvgFlow({
  cornerStyle: 'rounded',
  cornerRadius: 22,
  trackStyle: {
    width: 8, color: '#0a0d13', tube: true,
    innerColor: '#12182a', innerWidth: 3,
  },
  baseSpeed: 0.8,
  scrollMultiplier: 0.08,
  friction: 0.92,
  paths: [
    {
      elements: ['#a', '#b', '#c', '#d'],
      contourHug: 10,
      hugDirection: 'long',
      segments: [
        { width: 18, length: 80, gap: 200, color: '#00ffcc', opacity: 0.35, blur: 6, speedMultiplier: 1.0 },
        { width: 4,  length: 40, gap: 600, color: '#00ffcc', opacity: 0.9,  blur: 0, speedMultiplier: 1.4 },
        { width: 10, length: 20, gap: 400, color: '#00ffcc', opacity: 0.8,  blur: 4, speedMultiplier: 0.7,
          easing: 'wave', wavePeriod: 2000, waveAmplitude: 1.5 },
      ],
    },
  ],
})
```

---

## Framework usage

### React

```jsx
import { useEffect } from 'react'
import { SvgFlow } from '@woptima/svg-flow'

function Flow() {
  useEffect(() => {
    const flow = new SvgFlow({ paths: [{ elements: ['#a', '#b'] }] })
    return () => flow.destroy()   // tear down on unmount
  }, [])
  return null
}
```

### Vue 3 (`<script setup>`)

```vue
<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { SvgFlow } from '@woptima/svg-flow'

let flow
onMounted(() => {
  flow = new SvgFlow({ paths: [{ elements: ['#a', '#b'] }] })
})
onBeforeUnmount(() => flow?.destroy())
</script>
```

In both cases, mount **after** the target elements are in the DOM, and call `destroy()` on cleanup.

---

## Notes & gotchas

- **Coordinates are document-absolute.** Element positions are read via `getBoundingClientRect()` + scroll offset, so any positioning scheme (flow, flex, grid, absolute) works.
- **Re-routing is on layout change, not scroll.** Geometry is recomputed by a `ResizeObserver` on `<html>`. Scrolling only advances the dash offsets — cheap. If you change layout in a way that doesn't trigger a resize (rare), recreate the instance.
- **Stacking context.** If `document.body` is statically positioned, svgFlow sets `body { position: relative }` so a `z-index: -1` overlay stays above the page background but behind content.
- **`bends` is reserved.** The option is accepted but routing currently always auto-derives bends.

---

## Building from source

The package source lives in [`svg-flow/`](svg-flow/):

```bash
cd svg-flow
npm install
npm run build      # bundles to dist/ (ESM + UMD + types) via tsup
npm run typecheck  # tsc --noEmit
```

> The committed, ready-to-run `dist/` used by the `examples/` lives at the **repository root**. The npm package build (`cd svg-flow && npm run build`) emits its own `svg-flow/dist/`. If you change the source, rebuild and copy the artifacts to wherever your consumers import from.

---

## License

MIT © radioBros
