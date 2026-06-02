type Side = 'top' | 'bottom' | 'left' | 'right' | 'auto';
type CornerStyle = 'sharp' | 'rounded' | 'curved';
type BendCount = 'auto' | number;
type SegmentEasing = 'linear' | 'pulse' | 'wave' | 'ease-in' | 'ease-out' | 'ease-in-out';
interface TrackStyle {
    width?: number;
    color?: string;
    linecap?: 'round' | 'square' | 'butt';
    blur?: number;
    opacity?: number;
    tube?: boolean;
    innerColor?: string;
    innerWidth?: number;
    dashArray?: [number, number];
}
interface SegmentConfig {
    width?: number;
    length?: number;
    gap?: number;
    color?: string;
    opacity?: number;
    blur?: number;
    linecap?: 'round' | 'square' | 'butt';
    speedMultiplier?: number;
    baseSpeedOffset?: number;
    easing?: SegmentEasing;
    wavePeriod?: number;
    waveAmplitude?: number;
    pulseOn?: number;
    pulseOff?: number;
    startOffset?: number;
}
interface PathConfig {
    /** Ordered list of CSS selectors or element refs the path visits */
    elements: Array<string | HTMLElement>;
    cornerStyle?: CornerStyle;
    cornerRadius?: number;
    bends?: BendCount;
    /**
     * Gap in px between path and element border when hugging contours.
     * true = 6px default. Applies to all elements in the chain.
     */
    contourHug?: boolean | number;
    /**
     * Border-to-border distance (px) below which two consecutive elements are
     * "near": the link between them becomes a single continuous line between their
     * facing sides at the closest aligned spot, overriding the normal routing.
     * Used exactly as given (no implicit width-coupling).
     */
    nearThreshold?: number;
    /**
     * Which arc direction to use when wrapping intermediate elements.
     * 'short' = take the shortest arc to the exit side (default).
     * 'long'  = wrap the long way around, hugging as much border as possible.
     */
    hugDirection?: 'short' | 'long';
    trackStyle?: Partial<TrackStyle>;
    segments?: SegmentConfig[];
    scrollMultiplier?: number;
    friction?: number;
    baseSpeed?: number;
}
interface SvgFlowOptions {
    paths: PathConfig[];
    trackStyle?: TrackStyle;
    segments?: SegmentConfig[];
    cornerStyle?: CornerStyle;
    cornerRadius?: number;
    bends?: BendCount;
    contourHug?: boolean | number;
    hugDirection?: 'short' | 'long';
    /**
     * Border-to-border distance (px) below which two consecutive elements are
     * "near" and connected by a single continuous line between their facing sides
     * (overriding the normal routing). Used exactly as given. Default 30.
     */
    nearThreshold?: number;
    scrollMultiplier?: number;
    friction?: number;
    baseSpeed?: number;
    /**
     * Whether scrolling feeds momentum into the flow. When `true` (default) scroll
     * delta accelerates the segments via `scrollMultiplier`. When `false`, scrolling
     * is ignored entirely and the flow runs at the constant `baseSpeed` drift only.
     * Global-only: the scroll accumulator is shared across all paths.
     */
    accelerateOnScroll?: boolean;
    /**
     * Whether scrolling up reverses the flow direction. When `true` (default),
     * up-scroll pushes momentum backwards (the flow can reverse). When `false`,
     * up-scroll is ignored — only downward scroll accelerates the flow, which keeps
     * drifting forward and decays. Global-only.
     */
    reverseOnScrollUp?: boolean;
    zIndex?: number;
    pauseWhenHidden?: boolean;
    reducedMotion?: boolean;
    scrollContainer?: HTMLElement | Window;
}
interface Point {
    x: number;
    y: number;
}
interface AbsoluteRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}
interface ResolvedSegmentState {
    offset: number;
    createdAt: number;
}
interface ResolvedPath {
    config: PathConfig;
    elements: HTMLElement[];
    borderRadii: number[];
    group: SVGGElement;
    trackPaths: SVGPathElement[];
    segmentPaths: SVGPathElement[];
    pathLength: number;
    segmentStates: ResolvedSegmentState[];
}

declare const DEFAULT_TRACK_STYLE: Required<TrackStyle>;
declare const DEFAULT_SEGMENTS: SegmentConfig[];

type HSide = Exclude<Side, 'auto'>;
interface Seg {
    a: Point;
    b: Point;
    kind: 'stub' | 'bridge' | 'contour';
    allow?: number[];
}
/**
 * Serialise a polyline, rounding each interior vertex with a per-vertex radius.
 * `radii[i]` is the radius to use at `pts[i]` (interior vertices only).
 */
/**
 * Compute the effective rounding radius for every interior vertex.
 *
 * A 90° corner consumes exactly `r` along each adjacent segment (tangent
 * distance). A segment of length L between corners rA, rB can hold both iff
 * rA + rB ≤ L. When it can't, we scale BOTH ends down by s = L / (rA + rB) so
 * they share the segment proportionally instead of the naive even split (which
 * starves the larger corner). Two passes: clamp by each segment, take the min.
 */
declare const effectiveRadii: (pts: Point[], radii: number[]) => number[];
declare const routePath: (rects: AbsoluteRect[], borderRadii: number[], cornerStyle: CornerStyle, cornerRadius: number, _bends: BendCount, hugGap: number, hugDir?: "short" | "long", nearThreshold?: number) => string;
declare const __debugRoute: (rects: AbsoluteRect[], borderRadii: number[], cornerStyle: CornerStyle, cornerRadius: number, _bends: BendCount, hugGap: number, hugDir?: "short" | "long", nearThreshold?: number) => {
    d: string;
    waypoints: Point[];
    radii: number[];
    segments: Seg[];
    perElement: ({
        entrySide: HSide;
        exitSide: HSide;
        entryPt: Point;
        exitPt: Point;
    } | null)[];
};

declare class SvgFlow {
    private opts;
    private renderer;
    private animator;
    private paths;
    private visibilityHandler;
    constructor(options: SvgFlowOptions);
    private _buildPath;
    addPath(config: PathConfig): void;
    removePath(index: number): void;
    pause(): void;
    resume(): void;
    /**
     * Recompute every path's geometry from the current DOM layout and update the
     * SVG viewBox. Call this after moving/resizing connected elements in a way
     * that doesn't change the document size (which the internal ResizeObserver
     * already handles) — e.g. dragging an absolutely-positioned node.
     */
    refresh(): void;
    destroy(): void;
}

export { type AbsoluteRect, type BendCount, type CornerStyle, DEFAULT_SEGMENTS, DEFAULT_TRACK_STYLE, type PathConfig, type Point, type ResolvedPath, type SegmentConfig, type SegmentEasing, type Side, SvgFlow, type SvgFlowOptions, type TrackStyle, __debugRoute, effectiveRadii, routePath };
