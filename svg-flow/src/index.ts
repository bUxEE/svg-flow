import type {
  SvgFlowOptions,
  PathConfig,
  ResolvedPath,
} from './types.js'
import { Renderer, DEFAULT_TRACK_STYLE, DEFAULT_SEGMENTS } from './renderer.js'
import { Animator } from './animator.js'
import { isSSR, prefersReducedMotion } from './utils.js'

export type {
  SvgFlowOptions,
  PathConfig,
  SegmentConfig,
  TrackStyle,
  CornerStyle,
  BendCount,
  SegmentEasing,
  Side,
  ResolvedPath,
  Point,
  AbsoluteRect,
} from './types.js'
export { DEFAULT_TRACK_STYLE, DEFAULT_SEGMENTS } from './renderer.js'
export { routePath, __debugRoute, effectiveRadii } from './router.js'

const DEFAULTS: Required<SvgFlowOptions> = {
  paths: [],
  trackStyle: DEFAULT_TRACK_STYLE,
  segments: DEFAULT_SEGMENTS,
  cornerStyle: 'rounded',
  cornerRadius: 20,
  bends: 'auto',
  contourHug: false,
  hugDirection: 'short',
  nearThreshold: 30,
  scrollMultiplier: 0.06,
  friction: 0.92,
  baseSpeed: 0.8,
  accelerateOnScroll: true,
  reverseOnScrollUp: true,
  zIndex: -1,
  pauseWhenHidden: true,
  reducedMotion: true,
  scrollContainer: (typeof window !== 'undefined' ? window : null) as Window,
}

export class SvgFlow {
  private opts: Required<SvgFlowOptions>
  private renderer: Renderer
  private animator: Animator
  private paths: ResolvedPath[] = []
  private visibilityHandler: () => void

  constructor(options: SvgFlowOptions) {
    if (isSSR()) {
      throw new Error('[SvgFlow] Cannot be instantiated in a non-browser environment.')
    }

    this.opts = {
      ...DEFAULTS,
      ...options,
      trackStyle: { ...DEFAULTS.trackStyle, ...options.trackStyle },
      scrollContainer: options.scrollContainer ?? window,
    }

    if (this.opts.reducedMotion && prefersReducedMotion()) {
      this.opts.baseSpeed = 0
      this.opts.scrollMultiplier = 0
    }

    this.renderer = new Renderer(this.opts)
    this.animator = new Animator(this.opts)
    this.animator.setRenderer(this.renderer)

    for (const config of options.paths) {
      this._buildPath(config)
    }

    this.animator.setPaths(this.paths)
    this.animator.start()

    this.visibilityHandler = () => {
      if (!this.opts.pauseWhenHidden) return
      document.hidden ? this.animator.pause() : this.animator.resume()
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private _buildPath(config: PathConfig): void {
    const resolved = this.renderer.buildPath(config)
    if (resolved) this.paths.push(resolved)
  }

  addPath(config: PathConfig): void {
    this._buildPath(config)
    this.animator.setPaths(this.paths)
  }

  removePath(index: number): void {
    const resolved = this.paths[index]
    if (!resolved) return
    this.renderer.removePath(resolved)
    this.paths.splice(index, 1)
    this.animator.setPaths(this.paths)
  }

  pause(): void  { this.animator.pause() }
  resume(): void { this.animator.resume() }

  /**
   * Recompute every path's geometry from the current DOM layout and update the
   * SVG viewBox. Call this after moving/resizing connected elements in a way
   * that doesn't change the document size (which the internal ResizeObserver
   * already handles) — e.g. dragging an absolutely-positioned node.
   */
  refresh(): void {
    this.renderer.updateViewBox()
    for (const path of this.paths) {
      this.renderer.refreshPath(path)
      this.renderer.remeasureLength(path)
    }
  }

  destroy(): void {
    this.animator.destroy()
    this.renderer.destroy()
    document.removeEventListener('visibilitychange', this.visibilityHandler)
    this.paths = []
  }
}
