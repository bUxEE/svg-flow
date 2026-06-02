// ─── Enums / Unions ──────────────────────────────────────────────────────────

export type Side = 'top' | 'bottom' | 'left' | 'right' | 'auto'

export type CornerStyle =
  | 'sharp'
  | 'rounded'
  | 'curved'

export type BendCount =
  | 'auto'
  | number

export type SegmentEasing =
  | 'linear'
  | 'pulse'
  | 'wave'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'

// ─── Track (static tube) appearance ─────────────────────────────────────────

export interface TrackStyle {
  width?: number
  color?: string
  linecap?: 'round' | 'square' | 'butt'
  blur?: number
  opacity?: number
  tube?: boolean
  innerColor?: string
  innerWidth?: number
  dashArray?: [number, number]
}

// ─── Animated segment layer ───────────────────────────────────────────────────

export interface SegmentConfig {
  width?: number
  length?: number
  gap?: number
  color?: string
  opacity?: number
  blur?: number
  linecap?: 'round' | 'square' | 'butt'
  speedMultiplier?: number
  baseSpeedOffset?: number
  easing?: SegmentEasing
  wavePeriod?: number
  waveAmplitude?: number
  pulseOn?: number
  pulseOff?: number
  startOffset?: number
}

// ─── Per-path config (chain of elements) ────────────────────────────────────

export interface PathConfig {
  /** Ordered list of CSS selectors or element refs the path visits */
  elements: Array<string | HTMLElement>

  // ── path shape ──────────────────────────────────────────────────────────
  cornerStyle?: CornerStyle
  cornerRadius?: number
  bends?: BendCount
  /**
   * Gap in px between path and element border when hugging contours.
   * true = 6px default. Applies to all elements in the chain.
   */
  contourHug?: boolean | number
  /**
   * Border-to-border distance (px) below which two consecutive elements are
   * "near": the link between them becomes a single continuous line between their
   * facing sides at the closest aligned spot, overriding the normal routing.
   * Used exactly as given (no implicit width-coupling).
   */
  nearThreshold?: number
  /**
   * Which arc direction to use when wrapping intermediate elements.
   * 'short' = take the shortest arc to the exit side (default).
   * 'long'  = wrap the long way around, hugging as much border as possible.
   */
  hugDirection?: 'short' | 'long'

  // ── tube/track appearance ────────────────────────────────────────────────
  trackStyle?: Partial<TrackStyle>

  // ── animated segments ────────────────────────────────────────────────────
  segments?: SegmentConfig[]

  // ── animation overrides ──────────────────────────────────────────────────
  scrollMultiplier?: number
  friction?: number
  baseSpeed?: number
}

// ─── Global options ───────────────────────────────────────────────────────────

export interface SvgFlowOptions {
  paths: PathConfig[]

  trackStyle?: TrackStyle
  segments?: SegmentConfig[]

  cornerStyle?: CornerStyle
  cornerRadius?: number
  bends?: BendCount
  contourHug?: boolean | number
  hugDirection?: 'short' | 'long'
  /**
   * Border-to-border distance (px) below which two consecutive elements are
   * "near" and connected by a single continuous line between their facing sides
   * (overriding the normal routing). Used exactly as given. Default 30.
   */
  nearThreshold?: number

  scrollMultiplier?: number
  friction?: number
  baseSpeed?: number

  /**
   * Whether scrolling feeds momentum into the flow. When `true` (default) scroll
   * delta accelerates the segments via `scrollMultiplier`. When `false`, scrolling
   * is ignored entirely and the flow runs at the constant `baseSpeed` drift only.
   * Global-only: the scroll accumulator is shared across all paths.
   */
  accelerateOnScroll?: boolean
  /**
   * Whether scrolling up reverses the flow direction. When `true` (default),
   * up-scroll pushes momentum backwards (the flow can reverse). When `false`,
   * up-scroll is ignored — only downward scroll accelerates the flow, which keeps
   * drifting forward and decays. Global-only.
   */
  reverseOnScrollUp?: boolean

  zIndex?: number
  pauseWhenHidden?: boolean
  reducedMotion?: boolean
  scrollContainer?: HTMLElement | Window
}

// ─── Internal ────────────────────────────────────────────────────────────────

export interface Point {
  x: number
  y: number
}

export interface AbsoluteRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface ResolvedSegmentState {
  offset: number
  createdAt: number
}

export interface ResolvedPath {
  config: PathConfig
  elements: HTMLElement[]
  borderRadii: number[]
  group: SVGGElement
  trackPaths: SVGPathElement[]
  segmentPaths: SVGPathElement[]
  pathLength: number
  segmentStates: ResolvedSegmentState[]
}
