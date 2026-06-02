import type {
  PathConfig,
  ResolvedPath,
  ResolvedSegmentState,
  SegmentConfig,
  SvgFlowOptions,
  TrackStyle,
  AbsoluteRect,
} from './types.js'
import { createSVGEl, colorHash, getBorderRadius, getAbsoluteRect, resolveElement } from './utils.js'
import { routePath } from './router.js'

// ─── Default presets ──────────────────────────────────────────────────────────

export const DEFAULT_TRACK_STYLE: Required<TrackStyle> = {
  width: 6,
  color: '#1a1a2e',
  linecap: 'round',
  blur: 0,
  opacity: 1,
  tube: false,
  innerColor: '#2a2a4e',
  innerWidth: 0,
  dashArray: [0, 0],
}

export const DEFAULT_SEGMENTS: SegmentConfig[] = [
  {
    width: 16, length: 80,  gap: 200, color: '#00ffcc', opacity: 0.35,
    blur: 6,   linecap: 'round', speedMultiplier: 1.0,
    easing: 'linear', startOffset: -1200,
  },
  {
    width: 4,  length: 40,  gap: 600, color: '#00ffcc', opacity: 0.9,
    blur: 0,   linecap: 'round', speedMultiplier: 1.4,
    easing: 'linear', startOffset: -800,
  },
  {
    width: 10, length: 20,  gap: 400, color: '#00ffcc', opacity: 0.8,
    blur: 5,   linecap: 'round', speedMultiplier: 0.7,
    easing: 'wave', wavePeriod: 2000, waveAmplitude: 1.5, startOffset: -500,
  },
]

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class Renderer {
  private svg: SVGSVGElement
  private defs: SVGDefsElement
  private glowFilters = new Map<string, string>()
  private opts: Required<SvgFlowOptions>

  constructor(opts: Required<SvgFlowOptions>) {
    this.opts = opts
    this.svg = createSVGEl('svg')
    this.svg.setAttribute('id', 'svgflow-root')
    this.svg.setAttribute('aria-hidden', 'true')
    this.svg.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: ${opts.zIndex};
      overflow: visible;
    `
    // Ensure body is a stacking context so z-index:-1 stays above the page background
    if (getComputedStyle(document.body).position === 'static') {
      document.body.style.position = 'relative'
    }

    this.updateViewBox()
    this.defs = createSVGEl('defs')
    this.svg.appendChild(this.defs)
    // Insert as first child so the SVG is behind all sibling elements in paint order
    document.body.insertBefore(this.svg, document.body.firstChild)
  }

  updateViewBox(): void {
    const w = document.documentElement.scrollWidth
    const h = document.documentElement.scrollHeight
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    this.svg.style.width  = `${w}px`
    this.svg.style.height = `${h}px`
  }

  // ── Glow filter ────────────────────────────────────────────────────────────

  private ensureGlowFilter(color: string, stdDev: number): string {
    const key = `${color}:${stdDev}`
    if (this.glowFilters.has(key)) return this.glowFilters.get(key)!
    const id = `svgflow-glow-${colorHash(color)}-${Math.round(stdDev * 10)}`
    const filter = createSVGEl('filter')
    filter.setAttribute('id', id)
    filter.setAttribute('x', '-80%'); filter.setAttribute('y', '-80%')
    filter.setAttribute('width', '260%'); filter.setAttribute('height', '260%')
    const blur = createSVGEl('feGaussianBlur')
    blur.setAttribute('in', 'SourceGraphic')
    blur.setAttribute('stdDeviation', String(stdDev))
    blur.setAttribute('result', 'blur')
    const merge = createSVGEl('feMerge')
    const n1 = createSVGEl('feMergeNode'); n1.setAttribute('in', 'blur')
    const n2 = createSVGEl('feMergeNode'); n2.setAttribute('in', 'SourceGraphic')
    merge.appendChild(n1); merge.appendChild(n2)
    filter.appendChild(blur); filter.appendChild(merge)
    this.defs.appendChild(filter)
    this.glowFilters.set(key, id)
    return id
  }

  // ── Track path creation ────────────────────────────────────────────────────

  private buildTrackPaths(d: string, trackStyle: Required<TrackStyle>): SVGPathElement[] {
    const paths: SVGPathElement[] = []
    const makeBase = (): SVGPathElement => {
      const p = createSVGEl('path')
      p.setAttribute('d', d)
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke-linecap', trackStyle.linecap)
      p.setAttribute('stroke-linejoin', 'round')
      p.setAttribute('vector-effect', 'non-scaling-stroke')
      return p
    }
    const outer = makeBase()
    outer.setAttribute('stroke', trackStyle.color)
    outer.setAttribute('stroke-width', String(trackStyle.width))
    outer.setAttribute('opacity', String(trackStyle.opacity))
    if (trackStyle.dashArray[0] > 0) {
      outer.setAttribute('stroke-dasharray', `${trackStyle.dashArray[0]} ${trackStyle.dashArray[1]}`)
    }
    if (trackStyle.blur > 0) {
      outer.setAttribute('filter', `url(#${this.ensureGlowFilter(trackStyle.color, trackStyle.blur)})`)
    }
    paths.push(outer)
    if (trackStyle.tube) {
      const inner = makeBase()
      const iw = trackStyle.innerWidth > 0 ? trackStyle.innerWidth : trackStyle.width * 0.4
      inner.setAttribute('stroke', trackStyle.innerColor)
      inner.setAttribute('stroke-width', String(iw))
      inner.setAttribute('opacity', String(trackStyle.opacity * 0.6))
      paths.push(inner)
    }
    return paths
  }

  // ── Segment path creation ──────────────────────────────────────────────────

  private buildSegmentPath(d: string, seg: SegmentConfig, fallbackColor: string): SVGPathElement {
    const p = createSVGEl('path')
    p.setAttribute('d', d)
    p.setAttribute('fill', 'none')
    p.setAttribute('stroke-linecap', seg.linecap ?? 'round')
    p.setAttribute('stroke-linejoin', 'round')
    p.setAttribute('vector-effect', 'non-scaling-stroke')
    const color = seg.color ?? fallbackColor
    p.setAttribute('stroke', color)
    p.setAttribute('stroke-width', String(seg.width ?? 4))
    p.setAttribute('opacity', String(seg.opacity ?? 1))
    p.setAttribute('stroke-dasharray', `${seg.length ?? 40} ${seg.gap ?? 200}`)
    if ((seg.blur ?? 0) > 0) {
      p.setAttribute('filter', `url(#${this.ensureGlowFilter(color, seg.blur!)})`)
    }
    return p
  }

  // ── Build a full path ──────────────────────────────────────────────────────

  buildPath(config: PathConfig): ResolvedPath | null {
    const elements: HTMLElement[] = []
    for (const ref of config.elements) {
      const el = resolveElement(ref)
      if (!el) return null
      elements.push(el)
    }
    if (elements.length < 2) return null

    // Cache border radii at build time (they don't change)
    const borderRadii = elements.map(el => getBorderRadius(el))

    const trackStyle: Required<TrackStyle> = {
      ...DEFAULT_TRACK_STYLE,
      ...this.opts.trackStyle,
      ...config.trackStyle,
    }
    const segments: SegmentConfig[] =
      config.segments ?? this.opts.segments ?? DEFAULT_SEGMENTS

    const hugRaw = config.contourHug ?? this.opts.contourHug
    const hugGap = hugRaw === true ? 6 : (typeof hugRaw === 'number' ? hugRaw : 0)

    const d = this._computeD(elements, borderRadii, config, hugGap)

    const group = createSVGEl('g')
    group.setAttribute('class', 'svgflow-path')

    const trackPaths = this.buildTrackPaths(d, trackStyle)
    for (const tp of trackPaths) group.appendChild(tp)

    const fallbackColor = trackStyle.color
    const segmentPaths: SVGPathElement[] = []
    const segmentStates: ResolvedSegmentState[] = []

    for (const seg of segments) {
      const sp = this.buildSegmentPath(d, seg, fallbackColor)
      group.appendChild(sp)
      segmentPaths.push(sp)
      segmentStates.push({ offset: 0, createdAt: performance.now() })
    }

    this.svg.appendChild(group)

    // Measure path length after insertion
    const pathLength = trackPaths[0]!.getTotalLength?.() ?? 1000

    // Initialise dashoffsets
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!
      const state = segmentStates[i]!
      state.offset = seg.startOffset ?? -(pathLength * 0.5 + i * 150)
      segmentPaths[i]!.setAttribute('stroke-dashoffset', String(state.offset))
    }

    return { config, elements, borderRadii, group, trackPaths, segmentPaths, pathLength, segmentStates }
  }

  // ── Refresh (recompute d from current DOM layout) ─────────────────────────

  refreshPath(resolved: ResolvedPath): void {
    const { elements, borderRadii, config } = resolved
    const hugRaw = config.contourHug ?? this.opts.contourHug
    const hugGap = hugRaw === true ? 6 : (typeof hugRaw === 'number' ? hugRaw : 0)

    const d = this._computeD(elements, borderRadii, config, hugGap)
    for (const p of resolved.trackPaths)   p.setAttribute('d', d)
    for (const p of resolved.segmentPaths) p.setAttribute('d', d)
    // Update path length without getTotalLength (use cached value; only remeasure on resize)
  }

  remeasureLength(resolved: ResolvedPath): void {
    resolved.pathLength = resolved.trackPaths[0]!.getTotalLength?.() ?? resolved.pathLength
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _computeD(
    elements: HTMLElement[],
    borderRadii: number[],
    config: PathConfig,
    hugGap: number,
  ): string {
    const rects: AbsoluteRect[] = elements.map(el => getAbsoluteRect(el))
    const hugDir = config.hugDirection ?? this.opts.hugDirection ?? 'short'
    return routePath(
      rects,
      borderRadii,
      config.cornerStyle   ?? this.opts.cornerStyle,
      config.cornerRadius  ?? this.opts.cornerRadius,
      config.bends         ?? this.opts.bends,
      hugGap,
      hugDir,
      // Used exactly as given (default 30) — no implicit width-coupling, so an
      // explicit value always means what it says. Callers that want a
      // width-derived threshold compute it themselves.
      config.nearThreshold ?? this.opts.nearThreshold,
    )
  }

  removePath(resolved: ResolvedPath): void {
    resolved.group.remove()
  }

  destroy(): void {
    this.svg.remove()
    this.glowFilters.clear()
  }

  get svgEl(): SVGSVGElement {
    return this.svg
  }
}
