// Headless oracle for the router. Feeds real example coordinates plus synthetic
// forcing cases into routePath and asserts geometric invariants.
//
//   node test/oracle.mjs
//
// Invariants checked per path:
//   1. entry point !== exit point for every intermediate element
//   2. every interior bridge segment length >= 2 * cornerRadius (so the
//      rounded-corner radius is never clamped down)
//   3. no straight segment intersects any "blocked" chain rect
//      (blocked = every chain rect except the segment's allowed endpoints)
//
// The router is pure (rects in, geometry out), so this needs no DOM.

import { __debugRoute, effectiveRadii } from '../dist/svgflow.js'

const EPS = 1e-6
const len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
const mkRect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h })

// Does axis-aligned segment a-b pass through the interior of rect r?
const segHitsRect = (a, b, r) => {
  const L = r.left + EPS, T = r.top + EPS, R = r.right - EPS, B = r.bottom - EPS
  if (R <= L || B <= T) return false
  const dx = b.x - a.x, dy = b.y - a.y
  let t0 = 0, t1 = 1
  const clip = (p, q) => {
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

let failures = 0
const fail = (c, msg) => { failures++; console.log(`  ✗ [${c}] ${msg}`) }
const ok   = (c, msg) => console.log(`  ✓ [${c}] ${msg}`)

// ── Case runner ───────────────────────────────────────────────────────────────
// A case = { name, rects[], cornerRadius, cornerStyle?, hug?, borderRadius?,
//            expectCollapseFix?, expectDetour? }
const runCase = (cse) => {
  const { name, rects, cornerRadius } = cse
  const cornerStyle = cse.cornerStyle ?? 'rounded'
  const hug = cse.hug ?? 8
  const borderRadius = cse.borderRadius ?? 12
  const borderRadii = rects.map(() => borderRadius)

  const dbg = __debugRoute(rects, borderRadii, cornerStyle, cornerRadius, 'auto', hug, cse.hugDir ?? 'short')
  const { waypoints, segments, perElement, radii } = dbg

  console.log(`\n${name}  (${rects.length} elements)  r=${cornerRadius}`)

  // 1. entry != exit for every intermediate element
  for (let i = 1; i < rects.length - 1; i++) {
    const pe = perElement[i]
    if (!pe) { fail(name, `no per-element record for element ${i}`); continue }
    if (len(pe.entryPt, pe.exitPt) < 2) {
      fail(name, `el${i}: entry==exit at (${pe.entryPt.x|0},${pe.entryPt.y|0}) sides ${pe.entrySide}/${pe.exitSide}`)
    } else {
      ok(name, `el${i}: entry(${pe.entrySide}) ≠ exit(${pe.exitSide})`)
    }
  }

  // 0. every segment (stub, bridge, contour) MUST be axis-aligned
  let diagCount = 0
  for (const s of segments) {
    const ax = Math.abs(s.a.x - s.b.x) < 0.5
    const ay = Math.abs(s.a.y - s.b.y) < 0.5
    if (!ax && !ay) {
      diagCount++
      fail(name, `DIAGONAL ${s.kind} seg (${s.a.x|0},${s.a.y|0})→(${s.b.x|0},${s.b.y|0})`)
    }
  }
  if (diagCount === 0) ok(name, `all segments axis-aligned`)

  // 2. bridge legs must not be pathologically short (a real routing failure
  //    produces near-zero legs). The precise per-corner radius guarantee is
  //    checked by 2b below (proportional allocation), which supersedes the old
  //    blunt "≥ 2r" rule — a leg slightly under 2r is fine if the corners it
  //    feeds still render acceptably; 2b catches any that don't.
  let tinyCount = 0
  for (const s of segments) {
    if (s.kind !== 'bridge') continue
    if (len(s.a, s.b) < 4) {
      tinyCount++
      fail(name, `degenerate bridge leg ${len(s.a,s.b).toFixed(1)}px at (${s.a.x|0},${s.a.y|0})→(${s.b.x|0},${s.b.y|0})`)
    }
  }
  if (tinyCount === 0) ok(name, `no degenerate bridge legs`)

  // 2b. corners must render at full intended radius UNLESS physically blocked.
  //     Mirror the serializer's allocation exactly (effectiveRadii). A corner
  //     i is PHYSICAL/unavoidable iff some adjacent segment has rA+rB > L (two
  //     corners can't share that segment). Otherwise a clamp is an AVOIDABLE bug.
  const eff = effectiveRadii(waypoints, radii)
  let clampCount = 0, warnCount = 0
  for (let i = 1; i < waypoints.length - 1; i++) {
    const intended = radii[i] ?? 0
    if (intended < 1) continue
    if (eff[i] + 0.5 >= intended) continue   // renders full radius — fine
    // It clamps. Is it physical? Check both adjacent segments for rA+rB > L.
    const lp = len(waypoints[i - 1], waypoints[i]), ln = len(waypoints[i], waypoints[i + 1])
    const rPrev = radii[i - 1] ?? 0, rNext = radii[i + 1] ?? 0
    const physical = (intended + rPrev > lp + 0.5) || (intended + rNext > ln + 0.5)
    if (physical) {
      warnCount++
      console.log(`  ⚠ [${name}] corner ${i} (${waypoints[i].x|0},${waypoints[i].y|0}) capped at ${eff[i].toFixed(1)}<${intended} (element side too short — physical)`)
    } else {
      clampCount++
      fail(name, `corner ${i} (${waypoints[i].x|0},${waypoints[i].y|0}) AVOIDABLE clamp ${eff[i].toFixed(1)}<${intended} (lp=${lp.toFixed(1)} ln=${ln.toFixed(1)})`)
    }
  }
  if (clampCount === 0) ok(name, `no avoidable radius clamps${warnCount ? ` (${warnCount} physical cap${warnCount>1?'s':''})` : ''}`)

  // 3. no straight segment crosses a blocked rect
  let crossCount = 0
  for (const s of segments) {
    for (let ri = 0; ri < rects.length; ri++) {
      if (s.allow && s.allow.includes(ri)) continue
      if (segHitsRect(s.a, s.b, rects[ri])) {
        crossCount++
        fail(name, `${s.kind} seg (${s.a.x|0},${s.a.y|0})→(${s.b.x|0},${s.b.y|0}) crosses el${ri}`)
      }
    }
  }
  if (crossCount === 0) ok(name, `no segment crosses a blocked element`)

  if (!waypoints || waypoints.length < 2) fail(name, 'no waypoints')

  return { segments, perElement }
}

// ── multi-connection.html (vertical zigzag) ──────────────────────────────────
const NODE_W = 160, NODE_H = 53
const pos = {
  n1:[80,80], n2:[460,80], n3:[820,80], n4:[260,360], n5:[640,360],
  n6:[80,640], n7:[460,640], n8:[820,640], n9:[260,920], n10:[640,920],
  n11:[80,1200], n12:[820,1200],
}
const R = (id) => mkRect(pos[id][0], pos[id][1], NODE_W, NODE_H)
const zigzags = [
  { name: 'cyan',   ids: ['n1','n4','n6','n9','n11'],   cornerRadius: 20 },
  { name: 'amber',  ids: ['n2','n4','n7','n9','n11'],   cornerRadius: 30 },
  { name: 'purple', ids: ['n3','n5','n8','n10','n12'],  cornerRadius: 16 },
  { name: 'sky',    ids: ['n2','n5','n7','n10','n12'],  cornerRadius: 20 },
  { name: 'rose',   ids: ['n5','n8','n10'],             cornerRadius: 24 },
  { name: 'lime',   ids: ['n6','n9','n11'],             cornerRadius: 40 },
]
for (const z of zigzags) runCase({ name: z.name, rects: z.ids.map(R), cornerRadius: z.cornerRadius })

// ── basic.html — the screenshot's Node A/B/C/D layout (the reported collapse) ─
// For Node B both A (up-left) and C (down-left) face LEFT → collapse without fix.
const BW = 140, BH = 49
runCase({
  name: 'basic-ABCD',
  cornerRadius: 24, hug: 10, borderRadius: 10, hugDir: 'long',
  rects: [
    mkRect(200, 120, BW, BH),  // A
    mkRect(600, 400, BW, BH),  // B  ← collapse candidate
    mkRect(180, 700, BW, BH),  // C
    mkRect(500, 1000, BW, BH), // D
  ],
})

// ── Synthetic collapse: middle element with BOTH neighbours on its left ──────
// A top-left, B center, C bottom-left → facing(B,A)=left, facing(B,C)=left.
// Forces the chooseSides demote branch.
const collapse = runCase({
  name: 'collapse-forced',
  cornerRadius: 16,
  rects: [
    mkRect(20,  20,  100, 50), // A
    mkRect(400, 240, 100, 50), // B  middle — both neighbours to the LEFT
    mkRect(20,  460, 100, 50), // C
  ],
})
const cb = collapse.perElement[1]
if (cb && cb.entrySide !== cb.exitSide && len(cb.entryPt, cb.exitPt) >= 2) {
  ok('collapse-forced', `demote branch fired: entry=${cb.entrySide} exit=${cb.exitSide}`)
} else {
  fail('collapse-forced', `collapse NOT resolved: ${cb && cb.entrySide}/${cb && cb.exitSide}`)
}

// ── Synthetic forced-detour: an obstacle dead-center between two chain rects ──
// Chain 0 → 1 → 2 laid in a column. Element 2 (the far end) is fine, but we add
// a non-endpoint member that sits on the straight line of the 0→1 bridge so A*
// MUST route around it. We use a 3-chain where element 1 is offset and a wide
// element 2 overlaps the natural 0→1 corridor — but cleanest is: make the bridge
// from element 0 to element 1 have element 2 squarely between them.
//   0 at top, 1 at bottom, 2 a wide block centered between — chain order 0→2→1
//   would hug 2; instead we want 2 as a pure obstacle, so order 0→1→2 with 2
//   placed beside, and a separate wide blocker. Simpler: a 3-chain 0→1→2 where
//   the 1→2 bridge would naively cross element 0.
const detour = runCase({
  name: 'detour-forced',
  cornerRadius: 14,
  rects: [
    mkRect(300, 300, 200, 60),  // 0  wide block in the middle of the canvas
    mkRect(360, 40,  120, 50),  // 1  above 0
    mkRect(360, 560, 120, 50),  // 2  below 0 — bridge 1→2 would cross element 0
  ],
})
// Confirm the 1→2 bridge actually had to detour (more than a single straight
// drop): there must be a horizontal move in the bridge segments.
const bridge12 = detour.segments.filter(s => s.kind === 'bridge')
const hasHoriz = bridge12.some(s => Math.abs(s.a.y - s.b.y) < 0.5 && Math.abs(s.a.x - s.b.x) > 0.5)
if (hasHoriz) ok('detour-forced', `A* detoured (horizontal leg present)`)
else          fail('detour-forced', `no detour leg — route may be straight through obstacle`)

// ── Near pair: two consecutive elements closer than nearThreshold ────────────
// el0 directly above el1 with only an 8px gap (< 30). The OLD router stubbed out
// past el1 then hairpinned UP above el0 (to y≈205). The fix must hop directly:
// no waypoint on the el0→el1 bridge may escape the two elements' combined extent.
const NB_W = 140, NB_H = 49
for (const gap of [8, 20, 30]) {
  const el0 = mkRect(300, 200, NB_W, NB_H)              // [200, 249]
  const el1 = mkRect(300, 249 + gap, NB_W, NB_H)        // [249+gap, 298+gap]
  const el2 = mkRect(300, 800, NB_W, NB_H)              // far below
  const name = `near-pair-${gap}px`
  const dbg = __debugRoute([el0, el1, el2], [el0, el1, el2].map(() => 12), 'rounded', 20, 'auto', 10, 'short', 30)
  runCase({ name, rects: [el0, el1, el2], cornerRadius: 20, hug: 10, borderRadius: 12 })
  // Combined vertical extent of the near pair.
  const minY = Math.min(el0.top, el1.top), maxY = Math.max(el0.bottom, el1.bottom)
  // el0→el1 bridge segments only (allow includes both 0 and 1).
  const b01 = dbg.segments.filter(s => s.kind === 'bridge' && s.allow?.includes(0) && s.allow?.includes(1))
  const escapees = []
  for (const s of b01) {
    for (const p of [s.a, s.b]) if (p.y < minY - 3 || p.y > maxY + 3) escapees.push(p.y | 0)
  }
  if (escapees.length === 0) ok(name, `el0→el1 hops direct (no overshoot beyond [${minY},${maxY}])`)
  else fail(name, `el0→el1 overshoots pair extent at y=${escapees.join(',')} (expected within [${minY},${maxY}])`)
}

// ── Minimal-traversal selector: facing-hop & no loop-around ──────────────────
// The router picks sides to minimise total path. Two anchor cases the user drove:
//
//  A) Process and Filter side-by-side (Filter to the RIGHT). The connector must be
//     a short FACING hop — Filter entered on its LEFT (the side facing Process) —
//     not an "around the top" sweep. No contour may wrap Filter's far (right) side.
//
//  B) Filter UP-RIGHT of Process (the reported mess). Reaching Process, the path
//     must go straight to Filter's LEFT, NOT loop all the way around Process.
//     Assert Filter enters left and no waypoint encircles Process.
const sideExtent = (dbg, idx) => {
  const xs = dbg.segments.filter(s => s.kind === 'contour' && s.allow?.includes(idx)).flatMap(s => [s.a.x, s.b.x])
  return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : { min: Infinity, max: -Infinity }
}

{
  const AW = 150, AH = 70, hug = 10
  // A) level side-by-side. prev below-left, next below Filter.
  const prev = mkRect(120, 360, AW, AH)
  const proc = mkRect(180, 180, AW, AH)   // [180..330]
  const filt = mkRect(380, 180, AW, AH)   // [380..530], to the right
  const next = mkRect(430, 380, AW, AH)
  const rects = [prev, proc, filt, next]
  const dbg = __debugRoute(rects, rects.map(() => 14), 'rounded', 20, 'auto', hug, 'long', 30)
  runCase({ name: 'facing-hop', rects, cornerRadius: 20, hug, borderRadius: 14 })
  const pFilt = dbg.perElement[2]
  if (pFilt?.entrySide === 'left')
    ok('facing-hop', `Filter entered on its facing (left) side`)
  else
    fail('facing-hop', `Filter should enter left (facing Process), got ${pFilt?.entrySide}`)
  // Filter must not wrap its far/right side (that would be the old over-the-top sweep).
  const fx = sideExtent(dbg, 2)
  if (fx.max <= filt.right + hug + 2) ok('facing-hop', `no contour wraps Filter's far side (max x ${fx.max|0})`)
  else fail('facing-hop', `contour wraps Filter's far side (max x ${fx.max|0} > ${filt.right})`)
}

{
  const AW = 150, AH = 70, hug = 10
  // B) the reported image: Filter up-right of Process; prev left, next below Process.
  const prev = mkRect(65, 123, AW, AH)
  const proc = mkRect(280, 140, AW, AH)   // [280..430, 140..210]
  const filt = mkRect(475, 77, AW, AH)    // up-right
  const next = mkRect(320, 320, AW, AH)
  const rects = [prev, proc, filt, next]
  const dbg = __debugRoute(rects, rects.map(() => 14), 'rounded', 20, 'auto', hug, 'long', 30)
  runCase({ name: 'no-loop-around', rects, cornerRadius: 20, hug, borderRadius: 14 })
  const pFilt = dbg.perElement[2]
  if (pFilt?.entrySide === 'left')
    ok('no-loop-around', `Filter entered on its facing (left) side`)
  else
    fail('no-loop-around', `Filter should enter left (facing Process), got ${pFilt?.entrySide}`)
  // No waypoint should encircle Process: nothing should sit on Process's far (left)
  // side beyond its left border while routing Process→Filter (that's the loop).
  const procContour = sideExtent(dbg, 1)
  // Process is entered from prev (left/below) and exits toward Filter (up-right) —
  // its contour should stay on the near side, never reaching far past its left edge.
  if (procContour.min >= proc.left - hug - 2) ok('no-loop-around', `Process not encircled (contour min x ${procContour.min|0})`)
  else fail('no-loop-around', `Process encircled — contour reaches x ${procContour.min|0} (loop)`)
}

// ── Near-pair direct connector: override to a straight facing line ────────────
// Two elements within nearThreshold, side-by-side, OVERLAPPING in y. The user's
// spec: override all routing for THIS connection — one continuous line, fewest
// curves, docking at the closest spot. Since they overlap in y, that's a single
// STRAIGHT horizontal segment: Process exits right, Filter enters left, both at a
// shared y in the overlap band. (Without the override the DP picks Filter.top and
// the bridge hooks around Filter's top-left — the reported "weird turn".)
{
  const AW = 150, AH = 80, hug = 10
  const prev = mkRect(40, 300, AW, AH)
  const proc = mkRect(120, 60, AW, AH)    // [120..270, 60..140]
  const filt = mkRect(290, 90, AW, AH)    // [290..440, 90..170] — gap 20 (<30), y-overlap [90..140]
  const next = mkRect(560, 160, AW, AH)
  const rects = [prev, proc, filt, next]
  const dbg = __debugRoute(rects, rects.map(() => 14), 'rounded', 20, 'auto', hug, 'long', 30)
  runCase({ name: 'near-direct', rects, cornerRadius: 20, hug, borderRadius: 14 })
  const pProc = dbg.perElement[1], pFilt = dbg.perElement[2]
  // 1. Facing sides: Process exits right, Filter enters left.
  if (pProc?.exitSide === 'right' && pFilt?.entrySide === 'left')
    ok('near-direct', `facing sides (Process exits right, Filter enters left)`)
  else
    fail('near-direct', `expected Process.exit=right/Filter.entry=left, got ${pProc?.exitSide}/${pFilt?.entrySide}`)
  // 2. The connection is aligned: Process's exit dock and Filter's entry dock sit
  //    at the SAME y (a straight horizontal hand-off, not a hooking S-bend), and
  //    that y lies in the vertical overlap band [90,140]. With both hug-borders
  //    meeting, the two docks coincide — the path flows through continuously.
  const ePt = pProc?.exitPt, nPt = pFilt?.entryPt
  const aligned = ePt && nPt && Math.abs(ePt.y - nPt.y) < 2
  const inBand = ePt && ePt.y >= 90 - 2 && ePt.y <= 140 + 2
  if (aligned && inBand) ok('near-direct', `Process exit and Filter entry aligned at y≈${ePt.y|0} (straight, in band)`)
  else fail('near-direct', `docks not aligned in band: exit=(${ePt?.x|0},${ePt?.y|0}) entry=(${nPt?.x|0},${nPt?.y|0})`)
}

console.log(`\n${failures === 0 ? '✅ ALL INVARIANTS HOLD' : `❌ ${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
