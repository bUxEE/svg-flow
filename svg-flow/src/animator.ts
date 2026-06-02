import type {
  ResolvedPath,
  SegmentConfig,
  SegmentEasing,
  SvgFlowOptions,
} from './types.js'
import { DEFAULT_SEGMENTS, Renderer } from './renderer.js'

// ─── Easing ───────────────────────────────────────────────────────────────────

const applyEasing = (
  easing: SegmentEasing,
  baseVelocity: number,
  t: number,
  seg: SegmentConfig,
): number => {
  switch (easing) {
    case 'linear': return baseVelocity
    case 'wave': {
      const period    = seg.wavePeriod    ?? 2000
      const amplitude = seg.waveAmplitude ?? 1.5
      // Clamp to zero so the wave only slows segments, never reverses them
      const factor = Math.max(0, 1 + amplitude * Math.sin((t % period) / period * Math.PI * 2))
      return baseVelocity * factor
    }
    case 'pulse': {
      const on  = seg.pulseOn  ?? 400
      const off = seg.pulseOff ?? 800
      return (t % (on + off)) < on ? baseVelocity : 0
    }
    case 'ease-in': {
      const ramp = Math.min(t / 1000, 1)
      return baseVelocity * ramp * ramp
    }
    case 'ease-out': {
      const ramp = Math.min(t / 1000, 1)
      return baseVelocity * (1 - (1 - ramp) * (1 - ramp))
    }
    case 'ease-in-out': {
      const ramp = Math.min(t / 1000, 1)
      const s = ramp < 0.5 ? 2 * ramp * ramp : 1 - Math.pow(-2 * ramp + 2, 2) / 2
      return baseVelocity * s
    }
    default: return baseVelocity
  }
}

// ─── Animator ─────────────────────────────────────────────────────────────────

export class Animator {
  private paths: ResolvedPath[] = []
  private opts: Required<SvgFlowOptions>
  private renderer: Renderer | null = null

  private boost     = 0
  private lastScrollY = 0
  private rafId: number | null = null
  private paused    = false

  private onScroll: () => void
  private scrollTarget: HTMLElement | Window
  private resizeObserver: ResizeObserver

  constructor(opts: Required<SvgFlowOptions>) {
    this.opts = opts
    this.scrollTarget = opts.scrollContainer

    this.onScroll = () => {
      const currentY =
        this.scrollTarget === window
          ? window.scrollY
          : (this.scrollTarget as HTMLElement).scrollTop
      const delta = currentY - this.lastScrollY
      this.lastScrollY = currentY
      if (!this.opts.accelerateOnScroll) return
      // reverseOnScrollUp=false: ignore upward scroll entirely, so the flow only
      // ever accelerates forward (downward) and otherwise decays — never reverses.
      if (!this.opts.reverseOnScrollUp && delta < 0) return
      this.boost += delta * this.opts.scrollMultiplier
    }
    this.scrollTarget.addEventListener('scroll', this.onScroll, { passive: true })

    // ResizeObserver: recompute geometry, re-measure path lengths and update the
    // viewBox when the layout actually changes. Geometry is recomputed HERE
    // (event-driven) rather than every animation frame — element document-space
    // coordinates don't change on scroll, so a per-frame recompute is pure waste
    // and (with the discrete A* router) can snap routes to different topologies
    // when subpixel jitter crosses a grid threshold.
    this.resizeObserver = new ResizeObserver(() => {
      this.renderer?.updateViewBox()
      for (const path of this.paths) {
        this.renderer?.refreshPath(path)
        this.renderer?.remeasureLength(path)
      }
    })
    this.resizeObserver.observe(document.documentElement)
  }

  setPaths(paths: ResolvedPath[]): void {
    this.paths = paths
  }

  setRenderer(renderer: Renderer): void {
    this.renderer = renderer
  }

  start(): void {
    if (this.rafId !== null) return
    this.paused = false
    this.tick()
  }

  pause(): void {
    this.paused = true
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null }
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.tick()
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.scrollTarget.removeEventListener('scroll', this.onScroll)
    this.resizeObserver.disconnect()
    this.paths = []
  }

  private tick = (): void => {
    this.rafId = requestAnimationFrame(this.tick)

    this.boost *= this.opts.friction
    if (Math.abs(this.boost) < 0.001) this.boost = 0

    const now = performance.now()

    // Note: geometry is NOT recomputed here. Scrolling doesn't move elements in
    // document space, so the path `d` is stable; it's refreshed event-driven by
    // the ResizeObserver on actual layout change. tick() only advances the
    // scroll-driven dash animation below.

    for (const path of this.paths) {
      const connBoost = path.config.scrollMultiplier != null
        ? this.boost * (path.config.scrollMultiplier / this.opts.scrollMultiplier)
        : this.boost
      const connBase     = path.config.baseSpeed ?? this.opts.baseSpeed
      const connVelocity = connBase + connBoost

      const segments: SegmentConfig[] =
        path.config.segments ?? this.opts.segments ?? DEFAULT_SEGMENTS

      for (let i = 0; i < path.segmentPaths.length; i++) {
        const seg   = segments[i]
        if (!seg) continue
        const state = path.segmentStates[i]!
        const svgPath = path.segmentPaths[i]!
        const t     = now - state.createdAt

        const rawVelocity   = connVelocity * (seg.speedMultiplier ?? 1.0) + (seg.baseSpeedOffset ?? 0)
        const easedVelocity = applyEasing(seg.easing ?? 'linear', rawVelocity, t, seg)

        state.offset -= easedVelocity
        svgPath.setAttribute('stroke-dashoffset', String(state.offset))
      }
    }
  }
}
