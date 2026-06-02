import type { AbsoluteRect, BendCount, CornerStyle, Point, Side } from './types.js'

export interface RouteResult {
  d: string
  waypoints: Point[]
}

type HSide = Exclude<Side, 'auto'>

// ─── Geometry primitives ──────────────────────────────────────────────────────

const EPS = 1e-6
const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)
const samePt = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5

const isH = (side: HSide): boolean => side === 'left' || side === 'right'
const opposite = (side: HSide): HSide =>
  side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'top' ? 'bottom' : 'top'

/** Mid-point of a rect's side, offset outward by `gap`. */
const sideMid = (rect: AbsoluteRect, side: HSide, gap = 0): Point => {
  switch (side) {
    case 'top':    return { x: rect.left + rect.width / 2, y: rect.top    - gap }
    case 'bottom': return { x: rect.left + rect.width / 2, y: rect.bottom + gap }
    case 'left':   return { x: rect.left   - gap,          y: rect.top + rect.height / 2 }
    case 'right':  return { x: rect.right  + gap,          y: rect.top + rect.height / 2 }
  }
}

/** Step a point outward from a side by `gap`. */
const stepOut = (p: Point, side: HSide, gap: number): Point => {
  switch (side) {
    case 'top':    return { x: p.x, y: p.y - gap }
    case 'bottom': return { x: p.x, y: p.y + gap }
    case 'left':   return { x: p.x - gap, y: p.y }
    case 'right':  return { x: p.x + gap, y: p.y }
  }
}

/**
 * Slide a dock point along its side to a given perpendicular coordinate: for a
 * left/right side the perpendicular axis is Y, for top/bottom it's X. Used to
 * dock a near pair at an aligned spot (not the side midpoint) for a straight run.
 */
const withPerp = (p: Point, side: HSide, perp: number): Point =>
  (side === 'left' || side === 'right') ? { x: p.x, y: perp } : { x: perp, y: p.y }

/**
 * The wrap direction (cw/ccw) that traverses the FEWER sides from entry to exit —
 * i.e. the minimal-curve contour, independent of hugDirection. Used for near
 * pairs, which must take the shortest wrap regardless of the long-wrap override.
 */
const shorterWrap = (entry: HSide, exit: HSide): 'cw' | 'ccw' | null => {
  if (entry === exit) return null
  const sN: Record<HSide, number> = { top: 0, right: 1, bottom: 2, left: 3 }
  const cwDist = ((sN[exit] - sN[entry]) + 4) % 4   // # of CW side-steps
  return cwDist <= 2 ? 'cw' : 'ccw'
}

const inflate = (r: AbsoluteRect, m: number): AbsoluteRect => ({
  left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m,
  width: r.width + 2 * m, height: r.height + 2 * m,
})

/**
 * Does the axis-aligned segment a–b pass through the strict interior of rect r?
 * Edge-tangent contact does not count (we use a small epsilon inset).
 */
const segHitsRect = (a: Point, b: Point, r: AbsoluteRect): boolean => {
  const L = r.left + EPS, T = r.top + EPS, R = r.right - EPS, B = r.bottom - EPS
  if (R <= L || B <= T) return false
  const dx = b.x - a.x, dy = b.y - a.y
  let t0 = 0, t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < EPS) return q >= 0
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else       { if (t < t0) return false; if (t < t1) t1 = t }
    return true
  }
  if (!clip(-dx, a.x - L)) return false
  if (!clip( dx, R - a.x)) return false
  if (!clip(-dy, a.y - T)) return false
  if (!clip( dy, B - a.y)) return false
  return t1 - t0 > EPS
}

// ─── Side selection ───────────────────────────────────────────────────────────
// Entry/exit sides (and contour wrap direction) are chosen by the minimal-
// traversal DP in `selectSides` (below). The earlier per-element heuristics
// (facing / chooseSides / along-edge forcing / outer-wrap) were all replaced by
// that single rule.

// ─── Hanan-grid A* router (obstacle avoidance) ───────────────────────────────

interface Seg { a: Point; b: Point; kind: 'stub' | 'bridge' | 'contour'; allow?: number[] }

const uniq = (xs: number[]): number[] => {
  const s = [...xs].sort((p, q) => p - q)
  const out: number[] = []
  for (const v of s) if (out.length === 0 || Math.abs(out[out.length - 1]! - v) > 0.5) out.push(v)
  return out
}

/**
 * Route an orthogonal, obstacle-free polyline from `start` to `goal`.
 *
 * `start`/`goal` are the stub tips (already perpendicular to their element). The
 * first move from `start` must continue in `startDir`, and the path must arrive
 * at `goal` along `goalDir` (so the curve into the element is tangential).
 *
 * Obstacles = every inflated chain rect whose index is NOT in `allow`.
 *
 * The grid is the Hanan grid of obstacle edges + the stub coordinates, which is
 * sufficient to express any shortest obstacle-avoiding rectilinear route. Edges
 * shorter than `minSeg` are penalised so the radius is never clamped; A* prefers
 * routes whose every turn has ≥ minSeg runway, falling back only if forced.
 */
const routeBridge = (
  start: Point,
  goal: Point,
  startDir: HSide,
  goalDir: HSide,
  obstacles: AbsoluteRect[],
  minSeg: number,
): Point[] => {
  // Candidate grid lines.
  const xs = uniq([
    start.x, goal.x,
    ...obstacles.flatMap(o => [o.left, o.right]),
  ])
  const ys = uniq([
    start.y, goal.y,
    ...obstacles.flatMap(o => [o.top, o.bottom]),
  ])

  // Map coordinates to indices.
  const xi = new Map<number, number>(); xs.forEach((v, i) => xi.set(v, i))
  const yi = new Map<number, number>(); ys.forEach((v, i) => yi.set(v, i))
  const nearestX = (v: number): number => xs.reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b, xs[0]!)
  const nearestY = (v: number): number => ys.reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b, ys[0]!)

  const sx = nearestX(start.x), sy = nearestY(start.y)
  const gx = nearestX(goal.x),  gy = nearestY(goal.y)

  const key = (ix: number, iy: number, dir: number): string => `${ix},${iy},${dir}`
  // dir: 0=+x,1=-x,2=+y,3=-y,-1=none(start)
  const dirVec: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const dirOfSide: Record<HSide, number> = { right: 0, left: 1, bottom: 2, top: 3 }

  const blocked = (a: Point, b: Point): boolean =>
    obstacles.some(o => segHitsRect(a, b, o))

  // A* over (gridX, gridY, lastDir).
  interface Node { ix: number; iy: number; dir: number; g: number; f: number; prev: Node | null }
  const startIx = xi.get(sx)!, startIy = yi.get(sy)!
  const goalIx = xi.get(gx)!, goalIy = yi.get(gy)!
  const h = (ix: number, iy: number): number =>
    Math.abs(xs[ix]! - xs[goalIx]!) + Math.abs(ys[iy]! - ys[goalIy]!)

  const startNode: Node = { ix: startIx, iy: startIy, dir: dirOfSide[startDir], g: 0, f: 0, prev: null }
  startNode.f = h(startIx, startIy)
  const open: Node[] = [startNode]
  const best = new Map<string, number>()
  best.set(key(startIx, startIy, startNode.dir), 0)

  const goalArriveDir = dirOfSide[goalDir] // we must enter goal moving in this dir

  let found: Node | null = null
  let guard = 0
  while (open.length && guard++ < 200000) {
    // pop lowest f
    let bi = 0
    for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f) bi = i
    const cur = open.splice(bi, 1)[0]!
    if (cur.ix === goalIx && cur.iy === goalIy && cur.dir === goalArriveDir) { found = cur; break }

    for (let nd = 0; nd < 4; nd++) {
      // no immediate reversal
      if ((cur.dir === 0 && nd === 1) || (cur.dir === 1 && nd === 0) ||
          (cur.dir === 2 && nd === 3) || (cur.dir === 3 && nd === 2)) continue
      const [vx, vy] = dirVec[nd]!
      let nix = cur.ix, niy = cur.iy
      // step to the next grid line in direction nd
      if (vx > 0) nix = cur.ix + 1
      else if (vx < 0) nix = cur.ix - 1
      if (vy > 0) niy = cur.iy + 1
      else if (vy < 0) niy = cur.iy - 1
      if (nix < 0 || nix >= xs.length || niy < 0 || niy >= ys.length) continue

      const a: Point = { x: xs[cur.ix]!, y: ys[cur.iy]! }
      const b: Point = { x: xs[nix]!,    y: ys[niy]! }
      if (samePt(a, b)) continue
      if (blocked(a, b)) continue

      const segLen = dist(a, b)
      // turn cost + short-segment penalty so radius is never clamped
      const turnCost = cur.dir === -1 || cur.dir === nd ? 0 : minSeg
      const shortPen = segLen + EPS < minSeg && cur.dir !== nd ? minSeg * 4 : 0
      const ng = cur.g + segLen + turnCost + shortPen
      const k = key(nix, niy, nd)
      if (best.has(k) && best.get(k)! <= ng + EPS) continue
      best.set(k, ng)
      const node: Node = { ix: nix, iy: niy, dir: nd, g: ng, f: ng + h(nix, niy), prev: cur }
      open.push(node)
    }
  }

  // Reconstruct, or fall back to a naive L if A* somehow failed.
  const pts: Point[] = []
  if (found) {
    let n: Node | null = found
    while (n) { pts.unshift({ x: xs[n.ix]!, y: ys[n.iy]! }); n = n.prev }
  } else {
    pts.push({ x: sx, y: sy }, { x: gx, y: sy }, { x: gx, y: gy })
  }

  // Collapse collinear points.
  const out: Point[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const p = out[out.length - 1]!, c = pts[i]!, nx = pts[i + 1]!
    const collinear = (Math.abs(p.x - c.x) < 0.5 && Math.abs(c.x - nx.x) < 0.5) ||
                      (Math.abs(p.y - c.y) < 0.5 && Math.abs(c.y - nx.y) < 0.5)
    if (!collinear) out.push(c)
  }
  out.push(pts[pts.length - 1]!)
  return out
}

// ─── Perimeter walk (contour hugging) ────────────────────────────────────────

/**
 * Walk the offset border of `rect` from `entrySide` to `exitSide`, hugging the
 * element at radius `borderRadius + gap` (concentric with the element's own
 * rounded corner — requirement: contour arcs respect the *element* radius, not
 * the config corner radius).
 *
 * Returns the corner waypoints (entry stub-tip → corners → exit stub-tip) and
 * the per-arc radius to use when serialising. The first/last points are the
 * stub tips one `gap` outside the side mid-points.
 */
const perimeterWalk = (
  rect: AbsoluteRect,
  borderRadius: number,
  gap: number,
  entrySide: HSide,
  exitSide: HSide,
  hugDir: 'short' | 'long',
  forceDir?: 'cw' | 'ccw',
  entryPerp?: number | null,
  exitPerp?: number | null,
): { pts: Point[]; arcR: number; entryPt: Point; exitPt: Point } => {
  const L = rect.left - gap, T = rect.top - gap, R = rect.right + gap, B = rect.bottom + gap
  const W = R - L, H = B - T
  // contour radius = element border radius + gap, clamped to the offset box
  const arcR = Math.max(0, Math.min(borderRadius + gap, W / 2, H / 2))

  const off: AbsoluteRect = { left: L, top: T, right: R, bottom: B, width: W, height: H }
  // Entry/exit dock at the side midpoint, unless a near-pair alignment slides it
  // to a specific perpendicular coordinate for a straight connector.
  let entryPt = sideMid(off, entrySide)
  let exitPt  = sideMid(off, exitSide)
  if (entryPerp != null) entryPt = withPerp(entryPt, entrySide, entryPerp)
  if (exitPerp  != null) exitPt  = withPerp(exitPt,  exitSide,  exitPerp)

  // Sharp corner vertices, indexed TL=0, TR=1, BR=2, BL=3.
  const corner: Point[] = [
    { x: L, y: T }, { x: R, y: T }, { x: R, y: B }, { x: L, y: B },
  ]
  const sN: Record<HSide, number> = { top: 0, right: 1, bottom: 2, left: 3 }
  const cornerAfterCW: number[] = [1, 2, 3, 0]  // CW corner reached after leaving side i
  const cornerAfterCCW: number[] = [0, 1, 2, 3] // CCW corner reached after leaving side i

  // Choose direction: explicit override wins (used to force a box to wrap its
  // outer side for a clean along-edge run); otherwise shorter arc by default.
  const cwDist = ((sN[exitSide] - sN[entrySide]) + 4) % 4
  const cw = forceDir != null
    ? forceDir === 'cw'
    : entrySide === exitSide
      ? true
      : hugDir === 'long' ? cwDist > 2 : cwDist <= 2

  // Collect corners between entry and exit in chosen direction.
  const corners: number[] = []
  if (entrySide === exitSide) {
    let c = cornerAfterCW[sN[entrySide]]!
    for (let k = 0; k < 4; k++) { corners.push(c); c = (c + 1) % 4 }
  } else if (cw) {
    let c = cornerAfterCW[sN[entrySide]]!
    const stop = cornerAfterCW[sN[exitSide]]!
    while (c !== stop) { corners.push(c); c = (c + 1) % 4 }
  } else {
    let c = cornerAfterCCW[sN[entrySide]]!
    const stop = cornerAfterCCW[sN[exitSide]]!
    while (c !== stop) { corners.push(c); c = (c + 3) % 4 }
  }

  const pts: Point[] = [entryPt, ...corners.map(ci => corner[ci]!), exitPt]
  return { pts, arcR, entryPt, exitPt }
}

// ─── Path serialisers ─────────────────────────────────────────────────────────

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
export const effectiveRadii = (pts: Point[], radii: number[]): number[] => {
  const n = pts.length
  const eff = radii.map((r, i) => (i === 0 || i === n - 1 ? 0 : Math.max(0, r)))
  for (let i = 0; i < n - 1; i++) {
    const L = dist(pts[i]!, pts[i + 1]!)
    const rA = eff[i] ?? 0       // corner at start of this segment
    const rB = eff[i + 1] ?? 0   // corner at end
    if (rA + rB > L + EPS && rA + rB > 0) {
      const s = L / (rA + rB)
      eff[i] = rA * s
      eff[i + 1] = rB * s
    }
  }
  return eff
}

const serialise = (pts: Point[], style: CornerStyle, radii: number[]): string => {
  if (pts.length < 2) return ''
  if (style === 'sharp') {
    return pts.reduce((d, p, i) => d + (i === 0 ? `M ${r2(p.x)} ${r2(p.y)}` : ` L ${r2(p.x)} ${r2(p.y)}`), '')
  }
  const eff = effectiveRadii(pts, radii)
  let d = `M ${r2(pts[0]!.x)} ${r2(pts[0]!.y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!, curr = pts[i]!, next = pts[i + 1]!
    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y
    const dx2 = next.x - curr.x, dy2 = next.y - curr.y
    const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2)
    if (len1 < EPS || len2 < EPS) { continue }
    const cr = eff[i]!
    if (cr < 1) { d += ` L ${r2(curr.x)} ${r2(curr.y)}`; continue }
    const ux1 = dx1 / len1, uy1 = dy1 / len1
    const ux2 = dx2 / len2, uy2 = dy2 / len2
    const p1 = { x: curr.x - ux1 * cr, y: curr.y - uy1 * cr }
    const p2 = { x: curr.x + ux2 * cr, y: curr.y + uy2 * cr }
    if (style === 'curved') {
      d += ` L ${r2(p1.x)} ${r2(p1.y)} C ${r2(curr.x)} ${r2(curr.y)} ${r2(curr.x)} ${r2(curr.y)} ${r2(p2.x)} ${r2(p2.y)}`
    } else {
      d += ` L ${r2(p1.x)} ${r2(p1.y)} Q ${r2(curr.x)} ${r2(curr.y)} ${r2(p2.x)} ${r2(p2.y)}`
    }
  }
  const last = pts[pts.length - 1]!
  d += ` L ${r2(last.x)} ${r2(last.y)}`
  return d
}

const r2 = (n: number): number => Math.round(n * 100) / 100

// ─── Assembly ─────────────────────────────────────────────────────────────────

interface BuiltPath {
  pts: Point[]
  radii: number[]
  segments: Seg[]
  perElement: Array<{ entrySide: HSide; exitSide: HSide; entryPt: Point; exitPt: Point } | null>
}

/**
 * Signed border-to-border gap between two rects along the axis of `side`
 * (the side of `from` that faces `to`). Positive = clear space between them;
 * ≤ 0 = touching or overlapping on that axis.
 */
const borderGap = (from: AbsoluteRect, to: AbsoluteRect, side: HSide): number => {
  switch (side) {
    case 'right':  return to.left - from.right
    case 'left':   return from.left - to.right
    case 'bottom': return to.top - from.bottom
    case 'top':    return from.top - to.bottom
  }
}

// ─── Minimal-traversal side selector (chain DP) ──────────────────────────────

const ALL_SIDES: HSide[] = ['top', 'right', 'bottom', 'left']

/** Polyline length of a point list. */
const polyLen = (pts: Point[]): number => {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!)
  return s
}

interface SideChoice {
  entrySide: HSide[]
  exitSide: HSide[]
  wrapDir: Array<'cw' | 'ccw' | null>
  /** Aligned perpendicular dock coordinate for a near pair's exit/entry (else null). */
  exitDock: Array<number | null>
  entryDock: Array<number | null>
}

/**
 * Choose entry/exit sides (and contour wrap direction) for every element so the
 * total path — contour arcs + connecting bridges — is as short as possible, with
 * self-overlapping routes rejected first (lexicographic: no-overlap, then length).
 *
 * One principled rule replaces the old stack of side heuristics. It's a chain DP:
 *   state  = entrySide chosen for element i
 *   cost   = Σ over i of [ contour_i(entry_i, exit_i) + bridge(exit_i → entry_{i+1}) ]
 * Endpoints have only an exit (i=0) or only an entry (i=n-1). The bridge cost is
 * the real obstacle-avoiding A* length, so side pairs that force a detour around
 * a third element are naturally penalised. Run once per layout (resize), not per
 * frame, so the O(n · sides³) A* calls are affordable.
 */
const selectSides = (
  rects: AbsoluteRect[],
  borderRadii: number[],
  cornerRadius: number,
  hugGap: number,
  hugDir: 'short' | 'long',
  nearThreshold: number,
): SideChoice => {
  const n = rects.length
  const minSeg = 2 * cornerRadius
  // Opt-in override: when the caller explicitly asks for 'long', force the longer
  // contour wrap (and score the DP with it). Default ('short') = minimal path.
  const forceLong = hugDir === 'long'

  // Dock point on a side, one hugGap outside the border (where the contour sits).
  const dock = (rect: AbsoluteRect, side: HSide): Point => sideMid(rect, side, hugGap)

  // Contour traversal for an intermediate going entry→exit. `len` is ALWAYS the
  // shorter wrap's length, so the DP keeps choosing sensible (minimal-path) sides.
  // `dir` is the wrap direction the assembled route will use: the shorter wrap by
  // default, or the LONGER wrap when `forceLong` (explicit hugDirection:'long') —
  // restoring the old long-wrap look as an opt-in override without distorting the
  // side cost.
  const contour = (
    rect: AbsoluteRect, br: number, entry: HSide, exit: HSide,
  ): { len: number; dir: 'cw' | 'ccw' | null } => {
    if (entry === exit) {
      // Same-side U-turn: full loop, very long — effectively disallowed by cost.
      const w = perimeterWalk(rect, br, hugGap, entry, exit, 'short')
      return { len: polyLen(w.pts), dir: null }
    }
    const cw  = perimeterWalk(rect, br, hugGap, entry, exit, 'short', 'cw')
    const ccw = perimeterWalk(rect, br, hugGap, entry, exit, 'short', 'ccw')
    const lcw = polyLen(cw.pts), lccw = polyLen(ccw.pts)
    const shortLen = Math.min(lcw, lccw)
    const shortDir: 'cw' | 'ccw' = lcw <= lccw ? 'cw' : 'ccw'
    const dir = forceLong ? (shortDir === 'cw' ? 'ccw' : 'cw') : shortDir
    return { len: shortLen, dir }
  }

  // Obstacle-avoiding bridge length between two dock tips. Tips step one stub out
  // so the arrival is perpendicular, matching how build() routes.
  const bridgeLen = (
    fromRect: number, fromSide: HSide, toRect: number, toSide: HSide,
  ): number => {
    const a = stepOut(dock(rects[fromRect]!, fromSide), fromSide, minSeg)
    const b = stepOut(dock(rects[toRect]!, toSide), toSide, minSeg)
    const obstacles = rects
      .map((r, ri) => ({ r, ri }))
      .filter(({ ri }) => ri !== fromRect && ri !== toRect)
      .map(({ r }) => inflate(r, hugGap))
    const pts = routeBridge(a, b, fromSide, opposite(toSide), obstacles, minSeg)
    // include the two stub steps in the cost
    return polyLen(pts) + 2 * minSeg
  }

  if (n === 1) {
    return {
      entrySide: new Array(n), exitSide: new Array(n), wrapDir: new Array(n).fill(null),
      exitDock: new Array(n).fill(null), entryDock: new Array(n).fill(null),
    }
  }

  // Memoise the (expensive) A* bridge length per (fromRect, fromSide, toRect, toSide).
  const bridgeMemo = new Map<string, number>()
  const bridge = (fromRect: number, fromSide: HSide, toRect: number, toSide: HSide): number => {
    const k = `${fromRect}:${fromSide}->${toRect}:${toSide}`
    let v = bridgeMemo.get(k)
    if (v === undefined) { v = bridgeLen(fromRect, fromSide, toRect, toSide); bridgeMemo.set(k, v) }
    return v
  }

  // ── DP with state = exitSide of element i ─────────────────────────────────
  // dp[i][s] = min cost of elements 0..i with exit_i = s.
  //   el0: no contour → dp[0][s] = 0 for every side s (its exit).
  //   intermediate i: choose entry_i = e, pay bridge(exit_{i-1} → e) + contour_i(e, exit_i=s).
  //   last el: no exit → fold bridge(exit_{n-2} → entry) into a single terminal cost.
  // back[i][s] = { entry, prevExit } lets us recover both sides for every element.
  interface Cell { cost: number; entry: HSide | null; wrap: 'cw' | 'ccw' | null; prevExit: HSide | null }

  let prev = new Map<HSide, Cell>()
  for (const s of ALL_SIDES) prev.set(s, { cost: 0, entry: null, wrap: null, prevExit: null })
  const back: Array<Map<HSide, Cell>> = [prev]

  for (let i = 1; i < n - 1; i++) {
    const cur = new Map<HSide, Cell>()
    for (const exit of ALL_SIDES) {            // state: exit_i
      let best: Cell | null = null
      for (const entry of ALL_SIDES) {         // free var: entry_i
        if (entry === exit) continue           // no same-side U-turn for intermediates
        const c = contour(rects[i]!, borderRadii[i] ?? 0, entry, exit)
        for (const [pExit, pCell] of prev) {   // previous element's exit
          const total = pCell.cost + bridge(i - 1, pExit, i, entry) + c.len
          if (!best || total < best.cost) best = { cost: total, entry, wrap: c.dir, prevExit: pExit }
        }
      }
      if (best) cur.set(exit, best)
    }
    prev = cur
    back.push(cur)
  }

  // Terminal: last element has only an entry (no exit, no contour). Collapse over
  // (prevExit, entry) into a single best, stored under a sentinel key.
  const last = n - 1
  let termBest: Cell | null = null
  for (const entry of ALL_SIDES) {
    for (const [pExit, pCell] of prev) {
      const total = pCell.cost + bridge(last - 1, pExit, last, entry)
      if (!termBest || total < termBest.cost) termBest = { cost: total, entry, wrap: null, prevExit: pExit }
    }
  }

  // ── Reconstruct ───────────────────────────────────────────────────────────
  const entrySide: HSide[] = new Array(n)
  const exitSide: HSide[]  = new Array(n)
  const wrapDir: Array<'cw' | 'ccw' | null> = new Array(n).fill(null)

  // Last element: entry from terminal, no exit/wrap.
  entrySide[last] = termBest!.entry!
  let pExit = termBest!.prevExit!            // exit side of element last-1
  // Walk middle elements last-1 .. 1.
  for (let i = last - 1; i >= 1; i--) {
    exitSide[i] = pExit
    const cell = back[i]!.get(pExit)!
    entrySide[i] = cell.entry!
    wrapDir[i] = cell.wrap
    pExit = cell.prevExit!                   // exit side of element i-1
  }
  // Element 0: exit only.
  exitSide[0] = pExit

  // ── Near-pair direct-connector override ───────────────────────────────────
  // User-requested: when two consecutive elements sit within nearThreshold and
  // beside/above each other, override the DP for THAT connection — force the
  // facing sides and dock both at an aligned spot, so the link is one continuous
  // line with the fewest curves (a straight line when they overlap on the cross
  // axis, otherwise a single L). Only the i→i+1 connection is pinned; each
  // element's other connection stays DP-chosen.
  const exitDock: Array<number | null> = new Array(n).fill(null)
  const entryDock: Array<number | null> = new Array(n).fill(null)
  for (let i = 0; i < n - 1; i++) {
    const a = rects[i]!, b = rects[i + 1]!
    const sepX = Math.max(a.left - b.right, b.left - a.right)  // >0 ⇒ horizontally apart
    const sepY = Math.max(a.top - b.bottom, b.top - a.bottom)  // >0 ⇒ vertically apart
    const horiz = sepX >= sepY
    const gap = horiz ? sepX : sepY
    if (gap < -EPS || gap >= nearThreshold) continue           // not near (or overlapping in 2D)

    if (horiz) {
      const aLeft = a.left <= b.left
      exitSide[i]      = aLeft ? 'right' : 'left'
      entrySide[i + 1] = aLeft ? 'left'  : 'right'
      const top = Math.max(a.top, b.top), bot = Math.min(a.bottom, b.bottom)
      if (bot > top + EPS) { const y = (top + bot) / 2; exitDock[i] = y; entryDock[i + 1] = y }
    } else {
      const aTop = a.top <= b.top
      exitSide[i]      = aTop ? 'bottom' : 'top'
      entrySide[i + 1] = aTop ? 'top'    : 'bottom'
      const l = Math.max(a.left, b.left), r = Math.min(a.right, b.right)
      if (r > l + EPS) { const x = (l + r) / 2; exitDock[i] = x; entryDock[i + 1] = x }
    }

    // Guard against entry==exit collapse on the two forced intermediates: demote
    // the *non-forced* side to the opposite so the contour isn't a full U-turn.
    if (i > 0 && entrySide[i] === exitSide[i]) entrySide[i] = opposite(exitSide[i]!)
    if (i + 1 < n - 1 && exitSide[i + 1] === entrySide[i + 1]) exitSide[i + 1] = opposite(entrySide[i + 1]!)
    // Sides changed → force the SHORTEST wrap (minimal curves), overriding any
    // hugDirection:'long'. Only intermediates contour (endpoints don't).
    if (i > 0)         wrapDir[i]     = shorterWrap(entrySide[i]!, exitSide[i]!)
    if (i + 1 < n - 1) wrapDir[i + 1] = shorterWrap(entrySide[i + 1]!, exitSide[i + 1]!)
  }

  return { entrySide, exitSide, wrapDir, exitDock, entryDock }
}

const build = (
  rects: AbsoluteRect[],
  borderRadii: number[],
  cornerRadius: number,
  hugGap: number,
  hugDir: 'short' | 'long',
  nearThreshold: number,
): BuiltPath => {
  const n = rects.length
  const minSeg = 2 * cornerRadius

  // Stub clearance: a stub is flanked by a corner at each end (the arrival/exit
  // bend and the contour bend), each consuming up to `cornerRadius`. Give the
  // stub 2·cornerRadius so neither corner clamps. Always at least the hug gap.
  const stubOut = Math.max(hugGap, 2 * cornerRadius)

  // ── 1. Side selection: one minimal-traversal rule for every element ───────
  // A chain DP picks entry/exit sides (and contour wrap direction) to minimise
  // the total path (contour arcs + obstacle-avoiding bridges). This single rule
  // replaces the old stack of side heuristics — it naturally docks on the nearest
  // facing sides and hops directly between close neighbours, with no backtrack.
  const sel = selectSides(rects, borderRadii, cornerRadius, hugGap, hugDir, nearThreshold)
  const entrySide = sel.entrySide
  const exitSide  = sel.exitSide
  const forceWrap = sel.wrapDir
  const exitDock  = sel.exitDock
  const entryDock = sel.entryDock

  // ── 1b. Per-element effective hug ─────────────────────────────────────────
  // The contour wrap of an intermediate element is offset outward by the hug
  // gap. When a neighbour sits closer than that, the wrapped border would land
  // inside the neighbour — so cap each element's hug to its tightest neighbour
  // gap (along the relevant entry/exit side). Endpoints don't wrap, so they keep
  // the full hug for the offsets they hand to clampStubs.
  const effHug: number[] = new Array(n).fill(hugGap)
  for (let i = 1; i < n - 1; i++) {
    const gapPrev = borderGap(rects[i]!, rects[i - 1]!, entrySide[i]!)
    const gapNext = borderGap(rects[i]!, rects[i + 1]!, exitSide[i]!)
    // When the neighbour on a side is ALSO a contour-hugged intermediate, the two
    // both offset into the shared gap — so each may use at most gap/2, otherwise
    // their hugged borders overlap and the connector U-loops to reverse. Endpoints
    // dock flush (no hug), so against them the full gap is available.
    const prevHugs = i - 1 >= 1
    const nextHugs = i + 1 <= n - 2
    const capPrev = prevHugs ? gapPrev / 2 : gapPrev
    const capNext = nextHugs ? gapNext / 2 : gapNext
    effHug[i] = Math.max(0, Math.min(hugGap, capPrev, capNext))
  }

  const pts: Point[] = []
  const radii: number[] = []
  const segments: Seg[] = []
  const perElement: BuiltPath['perElement'] = new Array(n).fill(null)

  const pushPt = (p: Point, r: number) => {
    if (pts.length && samePt(pts[pts.length - 1]!, p)) return
    // Merge collinear runs: if the previous two points and p are colinear, the
    // middle point is redundant — replacing it keeps segments long so corner
    // radii never get clamped by a phantom short segment at a seam.
    if (pts.length >= 2) {
      const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!
      const colinH = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5
      const colinV = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5
      if (colinH || colinV) { pts[pts.length - 1] = p; radii[radii.length - 1] = r; return }
    }
    pts.push(p); radii.push(r)
  }

  // Clamp a (exit, entry) stub pair so their combined runway can't exceed the
  // border-to-border gap between the two elements. When two elements sit closer
  // than the stubs would need, the fixed-length stubs overshoot and A* has to
  // hairpin back; shrinking both proportionally lets the path hop straight to
  // the closest spot instead. `near` triggers when the gap is below the
  // configured threshold (≈ path width) — there we collapse the stubs to the
  // bare hug gap so the connector docks directly with no overshoot.
  // `exitOff` / `entryOff` are how far each anchor point already sits outside its
  // element's true border (a contour-hugged intermediate exits/enters `hugGap`
  // out; a flush dock is 0). The real runway between the two anchors is therefore
  // `gap − exitOff − entryOff`, not the raw border gap — feeding the raw gap is
  // what leaves a residual backtrack equal to the contour offset.
  const clampStubs = (
    desiredExit: number,
    desiredEntry: number,
    gap: number,
    exitOff: number,
    entryOff: number,
  ): { exit: number; entry: number; near: boolean } => {
    const near = gap < nearThreshold
    const runway = gap - exitOff - entryOff
    if (near) {
      // Direct hop: split the runway so the two stub tips meet in the middle and
      // never cross. Cap each at the hug gap (no need to step past the tube's own
      // clearance); when the runway is too tight, each stub shrinks so the
      // connector docks straight at the border with no overshoot.
      const each = Math.max(0, Math.min(hugGap, runway / 2))
      return { exit: each, entry: each, near: true }
    }
    const sum = desiredExit + desiredEntry
    // Never let the stub pair exceed the runway (which is what causes the
    // overshoot/hairpin); scale both down proportionally when it would.
    const budget = Math.max(0, runway)
    if (sum <= budget || sum <= 0) return { exit: desiredExit, entry: desiredEntry, near: false }
    const s = budget / sum
    return {
      exit:  Math.max(0, desiredExit * s),
      entry: Math.max(0, desiredEntry * s),
      near: false,
    }
  }

  // ── 2. First element: anchor on border, step out perpendicular ────────────
  // Size the exit stub against the gap to element 1 (lookahead) so a near
  // neighbour doesn't get an overshooting stub. Element 0 docks flush (offset 0);
  // element 1's entry sits hugGap out if it's an intermediate (contour-hugged).
  const firstGap   = borderGap(rects[0]!, rects[1]!, exitSide[0]!)
  const firstEntryOff = n > 2 ? effHug[1]! : 0  // element 1 is intermediate iff n > 2
  const firstClamp = clampStubs(stubOut, stubOut, firstGap, 0, firstEntryOff)
  let firstAnchor = sideMid(rects[0]!, exitSide[0]!)
  if (exitDock[0] != null) firstAnchor = withPerp(firstAnchor, exitSide[0]!, exitDock[0])
  const firstTip    = stepOut(firstAnchor, exitSide[0]!, firstClamp.exit)
  pushPt(firstAnchor, 0)
  pushPt(firstTip, cornerRadius)
  segments.push({ a: firstAnchor, b: firstTip, kind: 'stub', allow: [0] })

  let cursor = firstTip
  let cursorDir = exitSide[0]!  // direction we are currently travelling
  // Carry the entry-stub length the previous exit was clamped against, so the
  // matching entry stub into the next element uses the same shrunk budget.
  let pendingEntryStub = firstClamp.entry

  // ── 3. Walk through intermediate elements, then to the last ───────────────
  for (let i = 1; i < n; i++) {
    const rect = rects[i]!
    const isLast = i === n - 1
    const inSide = entrySide[i]!
    const outSide = isLast ? inSide : exitSide[i]!

    // For intermediate elements the path lands on the *hugged* border (offset by
    // hugGap) so the contour walk continues from the exact same point — no
    // diagonal hand-off. The last element has no contour walk, so it lands on
    // the true border (gap 0) for a clean perpendicular dock.
    const walk = isLast
      ? null
      : perimeterWalk(rect, borderRadii[i] ?? 0, effHug[i]!, inSide, outSide, hugDir, forceWrap[i] ?? undefined, entryDock[i], exitDock[i])
    let inMid = walk ? walk.entryPt : sideMid(rect, inSide)
    // Last element: apply any near-pair entry alignment to its flush dock.
    if (!walk && entryDock[i] != null) inMid = withPerp(inMid, inSide, entryDock[i]!)
    // Stub length: the tip end carries a bridge bend (cornerRadius); the inMid
    // end carries the contour dock bend (arcR) — so the stub needs room for the
    // larger pair, otherwise whichever corner is bigger gets clamped.
    const inStubDesired = walk
      ? Math.max(effHug[i]!, cornerRadius + walk.arcR)
      : Math.max(hugGap, 2 * cornerRadius)
    // Use the shrunk budget the previous element's exit stub was clamped to:
    // for a near pair both stubs collapse together (possibly below hugGap) so
    // the hop is direct with no overshoot.
    const inStub = Math.min(inStubDesired, pendingEntryStub)
    const inTip = stepOut(inMid, inSide, inStub)

    // Obstacles for this bridge: every chain rect except the source element
    // (i-1) and this target element (i). Inflate by the hug gap so the path
    // keeps clearance.
    const allow = [i - 1, i]
    const obstacles = rects
      .map((r, ri) => ({ r, ri }))
      .filter(({ ri }) => !allow.includes(ri))
      .map(({ r }) => inflate(r, hugGap))

    // A* bridge from cursor (travelling cursorDir) to inTip (arriving along
    // the inward normal = opposite(inSide)).
    const bridge = routeBridge(cursor, inTip, cursorDir, opposite(inSide), obstacles, minSeg)

    // Append bridge interior + tip. bridge[0] === cursor already in pts.
    for (let k = 1; k < bridge.length; k++) {
      pushPt(bridge[k]!, cornerRadius)
    }
    // Record bridge segments for the oracle. Skip coincident endpoints: when a
    // near pair's stubs collapse to a direct hop the two tips meet, producing a
    // zero-length leg that isn't a real segment.
    for (let k = 0; k < bridge.length - 1; k++) {
      if (samePt(bridge[k]!, bridge[k + 1]!)) continue
      segments.push({ a: bridge[k]!, b: bridge[k + 1]!, kind: 'bridge', allow })
    }

    // Step from tip onto the (hugged) border mid-point — perpendicular arrival.
    // When a contour walk follows, this vertex is the first contour bend, so it
    // takes the contour radius (arcR); the last element docks straight in (0).
    pushPt(inMid, walk ? walk.arcR : 0)
    segments.push({ a: inTip, b: inMid, kind: 'stub', allow: [i] })

    if (isLast || !walk) {
      perElement[i] = { entrySide: inSide, exitSide: inSide, entryPt: inMid, exitPt: inMid }
      break
    }

    // ── Contour walk across this intermediate element ──────────────────────
    // walk.pts[0] === inMid (both on the hugged border). Append corners + exit.
    for (let k = 1; k < walk.pts.length; k++) {
      pushPt(walk.pts[k]!, walk.arcR)
    }
    for (let k = 0; k < walk.pts.length - 1; k++) {
      segments.push({ a: walk.pts[k]!, b: walk.pts[k + 1]!, kind: 'contour', allow: [i] })
    }
    perElement[i] = { entrySide: inSide, exitSide: outSide, entryPt: inMid, exitPt: walk.exitPt }

    // Step out from the exit side for runway, then continue. Same sizing logic:
    // contour dock bend (arcR) at the border, bridge bend (cornerRadius) at tip.
    // Look ahead to element i+1 to clamp this exit stub against the gap, and
    // carry the matching entry budget into the next iteration.
    const outDesired = Math.max(effHug[i]!, cornerRadius + walk.arcR)
    const nextRect   = rects[i + 1]!
    const exitGap    = borderGap(rect, nextRect, outSide)
    // This element exits from its hugged border (offset effHug[i]). The next
    // entry sits effHug[i+1] out iff element i+1 is itself an intermediate.
    const nextEntryOff = i + 1 < n - 1 ? effHug[i + 1]! : 0
    const outClamp   = clampStubs(outDesired, outDesired, exitGap, effHug[i]!, nextEntryOff)
    pendingEntryStub = outClamp.entry
    const outTip = stepOut(walk.exitPt, outSide, outClamp.exit)
    pushPt(outTip, cornerRadius)
    segments.push({ a: walk.exitPt, b: outTip, kind: 'stub', allow: [i] })

    cursor = outTip
    cursorDir = outSide
  }

  return { pts, radii, segments, perElement }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export const routePath = (
  rects: AbsoluteRect[],
  borderRadii: number[],
  cornerStyle: CornerStyle,
  cornerRadius: number,
  _bends: BendCount,
  hugGap: number,
  hugDir: 'short' | 'long' = 'short',
  nearThreshold = 30,
): string => {
  if (rects.length < 2) return ''
  const { pts, radii } = build(rects, borderRadii, cornerRadius, hugGap, hugDir, nearThreshold)
  return serialise(pts, cornerStyle, radii)
}

// ─── Debug hook (used by test/oracle.mjs) ────────────────────────────────────

export const __debugRoute = (
  rects: AbsoluteRect[],
  borderRadii: number[],
  cornerStyle: CornerStyle,
  cornerRadius: number,
  _bends: BendCount,
  hugGap: number,
  hugDir: 'short' | 'long' = 'short',
  nearThreshold = 30,
) => {
  const built = build(rects, borderRadii, cornerRadius, hugGap, hugDir, nearThreshold)
  return {
    d: serialise(built.pts, cornerStyle, built.radii),
    waypoints: built.pts,
    radii: built.radii,
    segments: built.segments,
    perElement: built.perElement,
  }
}
