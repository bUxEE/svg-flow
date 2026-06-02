// src/utils.ts
var getAbsoluteRect = (el) => {
  const r = el.getBoundingClientRect();
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  return {
    left: r.left + scrollX,
    top: r.top + scrollY,
    right: r.right + scrollX,
    bottom: r.bottom + scrollY,
    width: r.width,
    height: r.height
  };
};
var resolveElement = (ref) => {
  if (typeof ref === "string") {
    return document.querySelector(ref);
  }
  return ref;
};
var colorHash = (color) => {
  let hash = 0;
  for (let i = 0; i < color.length; i++) {
    hash = (hash << 5) - hash + color.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 6);
};
var getBorderRadius = (el) => {
  const raw = window.getComputedStyle(el).borderRadius;
  return parseFloat(raw) || 0;
};
var SVG_NS = "http://www.w3.org/2000/svg";
var createSVGEl = (tag) => document.createElementNS(SVG_NS, tag);
var prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var isSSR = () => typeof window === "undefined";

// src/router.ts
var EPS = 1e-6;
var dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
var samePt = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
var opposite = (side) => side === "left" ? "right" : side === "right" ? "left" : side === "top" ? "bottom" : "top";
var sideMid = (rect, side, gap = 0) => {
  switch (side) {
    case "top":
      return { x: rect.left + rect.width / 2, y: rect.top - gap };
    case "bottom":
      return { x: rect.left + rect.width / 2, y: rect.bottom + gap };
    case "left":
      return { x: rect.left - gap, y: rect.top + rect.height / 2 };
    case "right":
      return { x: rect.right + gap, y: rect.top + rect.height / 2 };
  }
};
var stepOut = (p, side, gap) => {
  switch (side) {
    case "top":
      return { x: p.x, y: p.y - gap };
    case "bottom":
      return { x: p.x, y: p.y + gap };
    case "left":
      return { x: p.x - gap, y: p.y };
    case "right":
      return { x: p.x + gap, y: p.y };
  }
};
var withPerp = (p, side, perp) => side === "left" || side === "right" ? { x: p.x, y: perp } : { x: perp, y: p.y };
var shorterWrap = (entry, exit) => {
  if (entry === exit) return null;
  const sN = { top: 0, right: 1, bottom: 2, left: 3 };
  const cwDist = (sN[exit] - sN[entry] + 4) % 4;
  return cwDist <= 2 ? "cw" : "ccw";
};
var inflate = (r, m) => ({
  left: r.left - m,
  top: r.top - m,
  right: r.right + m,
  bottom: r.bottom + m,
  width: r.width + 2 * m,
  height: r.height + 2 * m
});
var segHitsRect = (a, b, r) => {
  const L = r.left + EPS, T = r.top + EPS, R = r.right - EPS, B = r.bottom - EPS;
  if (R <= L || B <= T) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < EPS) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, a.x - L)) return false;
  if (!clip(dx, R - a.x)) return false;
  if (!clip(-dy, a.y - T)) return false;
  if (!clip(dy, B - a.y)) return false;
  return t1 - t0 > EPS;
};
var uniq = (xs) => {
  const s = [...xs].sort((p, q) => p - q);
  const out = [];
  for (const v of s) if (out.length === 0 || Math.abs(out[out.length - 1] - v) > 0.5) out.push(v);
  return out;
};
var routeBridge = (start, goal, startDir, goalDir, obstacles, minSeg) => {
  const xs = uniq([
    start.x,
    goal.x,
    ...obstacles.flatMap((o) => [o.left, o.right])
  ]);
  const ys = uniq([
    start.y,
    goal.y,
    ...obstacles.flatMap((o) => [o.top, o.bottom])
  ]);
  const xi = /* @__PURE__ */ new Map();
  xs.forEach((v, i) => xi.set(v, i));
  const yi = /* @__PURE__ */ new Map();
  ys.forEach((v, i) => yi.set(v, i));
  const nearestX = (v) => xs.reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b, xs[0]);
  const nearestY = (v) => ys.reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b, ys[0]);
  const sx = nearestX(start.x), sy = nearestY(start.y);
  const gx = nearestX(goal.x), gy = nearestY(goal.y);
  const key = (ix, iy, dir) => `${ix},${iy},${dir}`;
  const dirVec = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dirOfSide = { right: 0, left: 1, bottom: 2, top: 3 };
  const blocked = (a, b) => obstacles.some((o) => segHitsRect(a, b, o));
  const startIx = xi.get(sx), startIy = yi.get(sy);
  const goalIx = xi.get(gx), goalIy = yi.get(gy);
  const h = (ix, iy) => Math.abs(xs[ix] - xs[goalIx]) + Math.abs(ys[iy] - ys[goalIy]);
  const startNode = { ix: startIx, iy: startIy, dir: dirOfSide[startDir], g: 0, f: 0, prev: null };
  startNode.f = h(startIx, startIy);
  const open = [startNode];
  const best = /* @__PURE__ */ new Map();
  best.set(key(startIx, startIy, startNode.dir), 0);
  const goalArriveDir = dirOfSide[goalDir];
  let found = null;
  let guard = 0;
  while (open.length && guard++ < 2e5) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.ix === goalIx && cur.iy === goalIy && cur.dir === goalArriveDir) {
      found = cur;
      break;
    }
    for (let nd = 0; nd < 4; nd++) {
      if (cur.dir === 0 && nd === 1 || cur.dir === 1 && nd === 0 || cur.dir === 2 && nd === 3 || cur.dir === 3 && nd === 2) continue;
      const [vx, vy] = dirVec[nd];
      let nix = cur.ix, niy = cur.iy;
      if (vx > 0) nix = cur.ix + 1;
      else if (vx < 0) nix = cur.ix - 1;
      if (vy > 0) niy = cur.iy + 1;
      else if (vy < 0) niy = cur.iy - 1;
      if (nix < 0 || nix >= xs.length || niy < 0 || niy >= ys.length) continue;
      const a = { x: xs[cur.ix], y: ys[cur.iy] };
      const b = { x: xs[nix], y: ys[niy] };
      if (samePt(a, b)) continue;
      if (blocked(a, b)) continue;
      const segLen = dist(a, b);
      const turnCost = cur.dir === -1 || cur.dir === nd ? 0 : minSeg;
      const shortPen = segLen + EPS < minSeg && cur.dir !== nd ? minSeg * 4 : 0;
      const ng = cur.g + segLen + turnCost + shortPen;
      const k = key(nix, niy, nd);
      if (best.has(k) && best.get(k) <= ng + EPS) continue;
      best.set(k, ng);
      const node = { ix: nix, iy: niy, dir: nd, g: ng, f: ng + h(nix, niy), prev: cur };
      open.push(node);
    }
  }
  const pts = [];
  if (found) {
    let n = found;
    while (n) {
      pts.unshift({ x: xs[n.ix], y: ys[n.iy] });
      n = n.prev;
    }
  } else {
    pts.push({ x: sx, y: sy }, { x: gx, y: sy }, { x: gx, y: gy });
  }
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = out[out.length - 1], c = pts[i], nx = pts[i + 1];
    const collinear = Math.abs(p.x - c.x) < 0.5 && Math.abs(c.x - nx.x) < 0.5 || Math.abs(p.y - c.y) < 0.5 && Math.abs(c.y - nx.y) < 0.5;
    if (!collinear) out.push(c);
  }
  out.push(pts[pts.length - 1]);
  return out;
};
var perimeterWalk = (rect, borderRadius, gap, entrySide, exitSide, hugDir, forceDir, entryPerp, exitPerp) => {
  const L = rect.left - gap, T = rect.top - gap, R = rect.right + gap, B = rect.bottom + gap;
  const W = R - L, H = B - T;
  const arcR = Math.max(0, Math.min(borderRadius + gap, W / 2, H / 2));
  const off = { left: L, top: T, right: R, bottom: B, width: W, height: H };
  let entryPt = sideMid(off, entrySide);
  let exitPt = sideMid(off, exitSide);
  if (entryPerp != null) entryPt = withPerp(entryPt, entrySide, entryPerp);
  if (exitPerp != null) exitPt = withPerp(exitPt, exitSide, exitPerp);
  const corner = [
    { x: L, y: T },
    { x: R, y: T },
    { x: R, y: B },
    { x: L, y: B }
  ];
  const sN = { top: 0, right: 1, bottom: 2, left: 3 };
  const cornerAfterCW = [1, 2, 3, 0];
  const cornerAfterCCW = [0, 1, 2, 3];
  const cwDist = (sN[exitSide] - sN[entrySide] + 4) % 4;
  const cw = forceDir != null ? forceDir === "cw" : entrySide === exitSide ? true : hugDir === "long" ? cwDist > 2 : cwDist <= 2;
  const corners = [];
  if (entrySide === exitSide) {
    let c = cornerAfterCW[sN[entrySide]];
    for (let k = 0; k < 4; k++) {
      corners.push(c);
      c = (c + 1) % 4;
    }
  } else if (cw) {
    let c = cornerAfterCW[sN[entrySide]];
    const stop = cornerAfterCW[sN[exitSide]];
    while (c !== stop) {
      corners.push(c);
      c = (c + 1) % 4;
    }
  } else {
    let c = cornerAfterCCW[sN[entrySide]];
    const stop = cornerAfterCCW[sN[exitSide]];
    while (c !== stop) {
      corners.push(c);
      c = (c + 3) % 4;
    }
  }
  const pts = [entryPt, ...corners.map((ci) => corner[ci]), exitPt];
  return { pts, arcR, entryPt, exitPt };
};
var effectiveRadii = (pts, radii) => {
  const n = pts.length;
  const eff = radii.map((r, i) => i === 0 || i === n - 1 ? 0 : Math.max(0, r));
  for (let i = 0; i < n - 1; i++) {
    const L = dist(pts[i], pts[i + 1]);
    const rA = eff[i] ?? 0;
    const rB = eff[i + 1] ?? 0;
    if (rA + rB > L + EPS && rA + rB > 0) {
      const s = L / (rA + rB);
      eff[i] = rA * s;
      eff[i + 1] = rB * s;
    }
  }
  return eff;
};
var serialise = (pts, style, radii) => {
  if (pts.length < 2) return "";
  if (style === "sharp") {
    return pts.reduce((d2, p, i) => d2 + (i === 0 ? `M ${r2(p.x)} ${r2(p.y)}` : ` L ${r2(p.x)} ${r2(p.y)}`), "");
  }
  const eff = effectiveRadii(pts, radii);
  let d = `M ${r2(pts[0].x)} ${r2(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], curr = pts[i], next = pts[i + 1];
    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
    const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
    if (len1 < EPS || len2 < EPS) {
      continue;
    }
    const cr = eff[i];
    if (cr < 1) {
      d += ` L ${r2(curr.x)} ${r2(curr.y)}`;
      continue;
    }
    const ux1 = dx1 / len1, uy1 = dy1 / len1;
    const ux2 = dx2 / len2, uy2 = dy2 / len2;
    const p1 = { x: curr.x - ux1 * cr, y: curr.y - uy1 * cr };
    const p2 = { x: curr.x + ux2 * cr, y: curr.y + uy2 * cr };
    if (style === "curved") {
      d += ` L ${r2(p1.x)} ${r2(p1.y)} C ${r2(curr.x)} ${r2(curr.y)} ${r2(curr.x)} ${r2(curr.y)} ${r2(p2.x)} ${r2(p2.y)}`;
    } else {
      d += ` L ${r2(p1.x)} ${r2(p1.y)} Q ${r2(curr.x)} ${r2(curr.y)} ${r2(p2.x)} ${r2(p2.y)}`;
    }
  }
  const last = pts[pts.length - 1];
  d += ` L ${r2(last.x)} ${r2(last.y)}`;
  return d;
};
var r2 = (n) => Math.round(n * 100) / 100;
var borderGap = (from, to, side) => {
  switch (side) {
    case "right":
      return to.left - from.right;
    case "left":
      return from.left - to.right;
    case "bottom":
      return to.top - from.bottom;
    case "top":
      return from.top - to.bottom;
  }
};
var ALL_SIDES = ["top", "right", "bottom", "left"];
var polyLen = (pts) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
};
var selectSides = (rects, borderRadii, cornerRadius, hugGap, hugDir, nearThreshold) => {
  const n = rects.length;
  const minSeg = 2 * cornerRadius;
  const forceLong = hugDir === "long";
  const dock = (rect, side) => sideMid(rect, side, hugGap);
  const contour = (rect, br, entry, exit) => {
    if (entry === exit) {
      const w = perimeterWalk(rect, br, hugGap, entry, exit, "short");
      return { len: polyLen(w.pts), dir: null };
    }
    const cw = perimeterWalk(rect, br, hugGap, entry, exit, "short", "cw");
    const ccw = perimeterWalk(rect, br, hugGap, entry, exit, "short", "ccw");
    const lcw = polyLen(cw.pts), lccw = polyLen(ccw.pts);
    const shortLen = Math.min(lcw, lccw);
    const shortDir = lcw <= lccw ? "cw" : "ccw";
    const dir = forceLong ? shortDir === "cw" ? "ccw" : "cw" : shortDir;
    return { len: shortLen, dir };
  };
  const bridgeLen = (fromRect, fromSide, toRect, toSide) => {
    const a = stepOut(dock(rects[fromRect], fromSide), fromSide, minSeg);
    const b = stepOut(dock(rects[toRect], toSide), toSide, minSeg);
    const obstacles = rects.map((r, ri) => ({ r, ri })).filter(({ ri }) => ri !== fromRect && ri !== toRect).map(({ r }) => inflate(r, hugGap));
    const pts = routeBridge(a, b, fromSide, opposite(toSide), obstacles, minSeg);
    return polyLen(pts) + 2 * minSeg;
  };
  if (n === 1) {
    return {
      entrySide: new Array(n),
      exitSide: new Array(n),
      wrapDir: new Array(n).fill(null),
      exitDock: new Array(n).fill(null),
      entryDock: new Array(n).fill(null)
    };
  }
  const bridgeMemo = /* @__PURE__ */ new Map();
  const bridge = (fromRect, fromSide, toRect, toSide) => {
    const k = `${fromRect}:${fromSide}->${toRect}:${toSide}`;
    let v = bridgeMemo.get(k);
    if (v === void 0) {
      v = bridgeLen(fromRect, fromSide, toRect, toSide);
      bridgeMemo.set(k, v);
    }
    return v;
  };
  let prev = /* @__PURE__ */ new Map();
  for (const s of ALL_SIDES) prev.set(s, { cost: 0, entry: null, wrap: null, prevExit: null });
  const back = [prev];
  for (let i = 1; i < n - 1; i++) {
    const cur = /* @__PURE__ */ new Map();
    for (const exit of ALL_SIDES) {
      let best = null;
      for (const entry of ALL_SIDES) {
        if (entry === exit) continue;
        const c = contour(rects[i], borderRadii[i] ?? 0, entry, exit);
        for (const [pExit2, pCell] of prev) {
          const total = pCell.cost + bridge(i - 1, pExit2, i, entry) + c.len;
          if (!best || total < best.cost) best = { cost: total, entry, wrap: c.dir, prevExit: pExit2 };
        }
      }
      if (best) cur.set(exit, best);
    }
    prev = cur;
    back.push(cur);
  }
  const last = n - 1;
  let termBest = null;
  for (const entry of ALL_SIDES) {
    for (const [pExit2, pCell] of prev) {
      const total = pCell.cost + bridge(last - 1, pExit2, last, entry);
      if (!termBest || total < termBest.cost) termBest = { cost: total, entry, wrap: null, prevExit: pExit2 };
    }
  }
  const entrySide = new Array(n);
  const exitSide = new Array(n);
  const wrapDir = new Array(n).fill(null);
  entrySide[last] = termBest.entry;
  let pExit = termBest.prevExit;
  for (let i = last - 1; i >= 1; i--) {
    exitSide[i] = pExit;
    const cell = back[i].get(pExit);
    entrySide[i] = cell.entry;
    wrapDir[i] = cell.wrap;
    pExit = cell.prevExit;
  }
  exitSide[0] = pExit;
  const exitDock = new Array(n).fill(null);
  const entryDock = new Array(n).fill(null);
  for (let i = 0; i < n - 1; i++) {
    const a = rects[i], b = rects[i + 1];
    const sepX = Math.max(a.left - b.right, b.left - a.right);
    const sepY = Math.max(a.top - b.bottom, b.top - a.bottom);
    const horiz = sepX >= sepY;
    const gap = horiz ? sepX : sepY;
    if (gap < -EPS || gap >= nearThreshold) continue;
    if (horiz) {
      const aLeft = a.left <= b.left;
      exitSide[i] = aLeft ? "right" : "left";
      entrySide[i + 1] = aLeft ? "left" : "right";
      const top = Math.max(a.top, b.top), bot = Math.min(a.bottom, b.bottom);
      if (bot > top + EPS) {
        const y = (top + bot) / 2;
        exitDock[i] = y;
        entryDock[i + 1] = y;
      }
    } else {
      const aTop = a.top <= b.top;
      exitSide[i] = aTop ? "bottom" : "top";
      entrySide[i + 1] = aTop ? "top" : "bottom";
      const l = Math.max(a.left, b.left), r = Math.min(a.right, b.right);
      if (r > l + EPS) {
        const x = (l + r) / 2;
        exitDock[i] = x;
        entryDock[i + 1] = x;
      }
    }
    if (i > 0 && entrySide[i] === exitSide[i]) entrySide[i] = opposite(exitSide[i]);
    if (i + 1 < n - 1 && exitSide[i + 1] === entrySide[i + 1]) exitSide[i + 1] = opposite(entrySide[i + 1]);
    if (i > 0) wrapDir[i] = shorterWrap(entrySide[i], exitSide[i]);
    if (i + 1 < n - 1) wrapDir[i + 1] = shorterWrap(entrySide[i + 1], exitSide[i + 1]);
  }
  return { entrySide, exitSide, wrapDir, exitDock, entryDock };
};
var build = (rects, borderRadii, cornerRadius, hugGap, hugDir, nearThreshold) => {
  const n = rects.length;
  const minSeg = 2 * cornerRadius;
  const stubOut = Math.max(hugGap, 2 * cornerRadius);
  const sel = selectSides(rects, borderRadii, cornerRadius, hugGap, hugDir, nearThreshold);
  const entrySide = sel.entrySide;
  const exitSide = sel.exitSide;
  const forceWrap = sel.wrapDir;
  const exitDock = sel.exitDock;
  const entryDock = sel.entryDock;
  const effHug = new Array(n).fill(hugGap);
  for (let i = 1; i < n - 1; i++) {
    const gapPrev = borderGap(rects[i], rects[i - 1], entrySide[i]);
    const gapNext = borderGap(rects[i], rects[i + 1], exitSide[i]);
    const prevHugs = i - 1 >= 1;
    const nextHugs = i + 1 <= n - 2;
    const capPrev = prevHugs ? gapPrev / 2 : gapPrev;
    const capNext = nextHugs ? gapNext / 2 : gapNext;
    effHug[i] = Math.max(0, Math.min(hugGap, capPrev, capNext));
  }
  const pts = [];
  const radii = [];
  const segments = [];
  const perElement = new Array(n).fill(null);
  const pushPt = (p, r) => {
    if (pts.length && samePt(pts[pts.length - 1], p)) return;
    if (pts.length >= 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const colinH = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5;
      const colinV = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5;
      if (colinH || colinV) {
        pts[pts.length - 1] = p;
        radii[radii.length - 1] = r;
        return;
      }
    }
    pts.push(p);
    radii.push(r);
  };
  const clampStubs = (desiredExit, desiredEntry, gap, exitOff, entryOff) => {
    const near = gap < nearThreshold;
    const runway = gap - exitOff - entryOff;
    if (near) {
      const each = Math.max(0, Math.min(hugGap, runway / 2));
      return { exit: each, entry: each, near: true };
    }
    const sum = desiredExit + desiredEntry;
    const budget = Math.max(0, runway);
    if (sum <= budget || sum <= 0) return { exit: desiredExit, entry: desiredEntry, near: false };
    const s = budget / sum;
    return {
      exit: Math.max(0, desiredExit * s),
      entry: Math.max(0, desiredEntry * s),
      near: false
    };
  };
  const firstGap = borderGap(rects[0], rects[1], exitSide[0]);
  const firstEntryOff = n > 2 ? effHug[1] : 0;
  const firstClamp = clampStubs(stubOut, stubOut, firstGap, 0, firstEntryOff);
  let firstAnchor = sideMid(rects[0], exitSide[0]);
  if (exitDock[0] != null) firstAnchor = withPerp(firstAnchor, exitSide[0], exitDock[0]);
  const firstTip = stepOut(firstAnchor, exitSide[0], firstClamp.exit);
  pushPt(firstAnchor, 0);
  pushPt(firstTip, cornerRadius);
  segments.push({ a: firstAnchor, b: firstTip, kind: "stub", allow: [0] });
  let cursor = firstTip;
  let cursorDir = exitSide[0];
  let pendingEntryStub = firstClamp.entry;
  for (let i = 1; i < n; i++) {
    const rect = rects[i];
    const isLast = i === n - 1;
    const inSide = entrySide[i];
    const outSide = isLast ? inSide : exitSide[i];
    const walk = isLast ? null : perimeterWalk(rect, borderRadii[i] ?? 0, effHug[i], inSide, outSide, hugDir, forceWrap[i] ?? void 0, entryDock[i], exitDock[i]);
    let inMid = walk ? walk.entryPt : sideMid(rect, inSide);
    if (!walk && entryDock[i] != null) inMid = withPerp(inMid, inSide, entryDock[i]);
    const inStubDesired = walk ? Math.max(effHug[i], cornerRadius + walk.arcR) : Math.max(hugGap, 2 * cornerRadius);
    const inStub = Math.min(inStubDesired, pendingEntryStub);
    const inTip = stepOut(inMid, inSide, inStub);
    const allow = [i - 1, i];
    const obstacles = rects.map((r, ri) => ({ r, ri })).filter(({ ri }) => !allow.includes(ri)).map(({ r }) => inflate(r, hugGap));
    const bridge = routeBridge(cursor, inTip, cursorDir, opposite(inSide), obstacles, minSeg);
    for (let k = 1; k < bridge.length; k++) {
      pushPt(bridge[k], cornerRadius);
    }
    for (let k = 0; k < bridge.length - 1; k++) {
      if (samePt(bridge[k], bridge[k + 1])) continue;
      segments.push({ a: bridge[k], b: bridge[k + 1], kind: "bridge", allow });
    }
    pushPt(inMid, walk ? walk.arcR : 0);
    segments.push({ a: inTip, b: inMid, kind: "stub", allow: [i] });
    if (isLast || !walk) {
      perElement[i] = { entrySide: inSide, exitSide: inSide, entryPt: inMid, exitPt: inMid };
      break;
    }
    for (let k = 1; k < walk.pts.length; k++) {
      pushPt(walk.pts[k], walk.arcR);
    }
    for (let k = 0; k < walk.pts.length - 1; k++) {
      segments.push({ a: walk.pts[k], b: walk.pts[k + 1], kind: "contour", allow: [i] });
    }
    perElement[i] = { entrySide: inSide, exitSide: outSide, entryPt: inMid, exitPt: walk.exitPt };
    const outDesired = Math.max(effHug[i], cornerRadius + walk.arcR);
    const nextRect = rects[i + 1];
    const exitGap = borderGap(rect, nextRect, outSide);
    const nextEntryOff = i + 1 < n - 1 ? effHug[i + 1] : 0;
    const outClamp = clampStubs(outDesired, outDesired, exitGap, effHug[i], nextEntryOff);
    pendingEntryStub = outClamp.entry;
    const outTip = stepOut(walk.exitPt, outSide, outClamp.exit);
    pushPt(outTip, cornerRadius);
    segments.push({ a: walk.exitPt, b: outTip, kind: "stub", allow: [i] });
    cursor = outTip;
    cursorDir = outSide;
  }
  return { pts, radii, segments, perElement };
};
var routePath = (rects, borderRadii, cornerStyle, cornerRadius, _bends, hugGap, hugDir = "short", nearThreshold = 30) => {
  if (rects.length < 2) return "";
  const { pts, radii } = build(rects, borderRadii, cornerRadius, hugGap, hugDir, nearThreshold);
  return serialise(pts, cornerStyle, radii);
};
var __debugRoute = (rects, borderRadii, cornerStyle, cornerRadius, _bends, hugGap, hugDir = "short", nearThreshold = 30) => {
  const built = build(rects, borderRadii, cornerRadius, hugGap, hugDir, nearThreshold);
  return {
    d: serialise(built.pts, cornerStyle, built.radii),
    waypoints: built.pts,
    radii: built.radii,
    segments: built.segments,
    perElement: built.perElement
  };
};

// src/renderer.ts
var DEFAULT_TRACK_STYLE = {
  width: 6,
  color: "#1a1a2e",
  linecap: "round",
  blur: 0,
  opacity: 1,
  tube: false,
  innerColor: "#2a2a4e",
  innerWidth: 0,
  dashArray: [0, 0]
};
var DEFAULT_SEGMENTS = [
  {
    width: 16,
    length: 80,
    gap: 200,
    color: "#00ffcc",
    opacity: 0.35,
    blur: 6,
    linecap: "round",
    speedMultiplier: 1,
    easing: "linear",
    startOffset: -1200
  },
  {
    width: 4,
    length: 40,
    gap: 600,
    color: "#00ffcc",
    opacity: 0.9,
    blur: 0,
    linecap: "round",
    speedMultiplier: 1.4,
    easing: "linear",
    startOffset: -800
  },
  {
    width: 10,
    length: 20,
    gap: 400,
    color: "#00ffcc",
    opacity: 0.8,
    blur: 5,
    linecap: "round",
    speedMultiplier: 0.7,
    easing: "wave",
    wavePeriod: 2e3,
    waveAmplitude: 1.5,
    startOffset: -500
  }
];
var Renderer = class {
  constructor(opts) {
    this.glowFilters = /* @__PURE__ */ new Map();
    this.opts = opts;
    this.svg = createSVGEl("svg");
    this.svg.setAttribute("id", "svgflow-root");
    this.svg.setAttribute("aria-hidden", "true");
    this.svg.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: ${opts.zIndex};
      overflow: visible;
    `;
    if (getComputedStyle(document.body).position === "static") {
      document.body.style.position = "relative";
    }
    this.updateViewBox();
    this.defs = createSVGEl("defs");
    this.svg.appendChild(this.defs);
    document.body.insertBefore(this.svg, document.body.firstChild);
  }
  updateViewBox() {
    const w = document.documentElement.scrollWidth;
    const h = document.documentElement.scrollHeight;
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.svg.style.width = `${w}px`;
    this.svg.style.height = `${h}px`;
  }
  // ── Glow filter ────────────────────────────────────────────────────────────
  ensureGlowFilter(color, stdDev) {
    const key = `${color}:${stdDev}`;
    if (this.glowFilters.has(key)) return this.glowFilters.get(key);
    const id = `svgflow-glow-${colorHash(color)}-${Math.round(stdDev * 10)}`;
    const filter = createSVGEl("filter");
    filter.setAttribute("id", id);
    filter.setAttribute("x", "-80%");
    filter.setAttribute("y", "-80%");
    filter.setAttribute("width", "260%");
    filter.setAttribute("height", "260%");
    const blur = createSVGEl("feGaussianBlur");
    blur.setAttribute("in", "SourceGraphic");
    blur.setAttribute("stdDeviation", String(stdDev));
    blur.setAttribute("result", "blur");
    const merge = createSVGEl("feMerge");
    const n1 = createSVGEl("feMergeNode");
    n1.setAttribute("in", "blur");
    const n2 = createSVGEl("feMergeNode");
    n2.setAttribute("in", "SourceGraphic");
    merge.appendChild(n1);
    merge.appendChild(n2);
    filter.appendChild(blur);
    filter.appendChild(merge);
    this.defs.appendChild(filter);
    this.glowFilters.set(key, id);
    return id;
  }
  // ── Track path creation ────────────────────────────────────────────────────
  buildTrackPaths(d, trackStyle) {
    const paths = [];
    const makeBase = () => {
      const p = createSVGEl("path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-linecap", trackStyle.linecap);
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("vector-effect", "non-scaling-stroke");
      return p;
    };
    const outer = makeBase();
    outer.setAttribute("stroke", trackStyle.color);
    outer.setAttribute("stroke-width", String(trackStyle.width));
    outer.setAttribute("opacity", String(trackStyle.opacity));
    if (trackStyle.dashArray[0] > 0) {
      outer.setAttribute("stroke-dasharray", `${trackStyle.dashArray[0]} ${trackStyle.dashArray[1]}`);
    }
    if (trackStyle.blur > 0) {
      outer.setAttribute("filter", `url(#${this.ensureGlowFilter(trackStyle.color, trackStyle.blur)})`);
    }
    paths.push(outer);
    if (trackStyle.tube) {
      const inner = makeBase();
      const iw = trackStyle.innerWidth > 0 ? trackStyle.innerWidth : trackStyle.width * 0.4;
      inner.setAttribute("stroke", trackStyle.innerColor);
      inner.setAttribute("stroke-width", String(iw));
      inner.setAttribute("opacity", String(trackStyle.opacity * 0.6));
      paths.push(inner);
    }
    return paths;
  }
  // ── Segment path creation ──────────────────────────────────────────────────
  buildSegmentPath(d, seg, fallbackColor) {
    const p = createSVGEl("path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke-linecap", seg.linecap ?? "round");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("vector-effect", "non-scaling-stroke");
    const color = seg.color ?? fallbackColor;
    p.setAttribute("stroke", color);
    p.setAttribute("stroke-width", String(seg.width ?? 4));
    p.setAttribute("opacity", String(seg.opacity ?? 1));
    p.setAttribute("stroke-dasharray", `${seg.length ?? 40} ${seg.gap ?? 200}`);
    if ((seg.blur ?? 0) > 0) {
      p.setAttribute("filter", `url(#${this.ensureGlowFilter(color, seg.blur)})`);
    }
    return p;
  }
  // ── Build a full path ──────────────────────────────────────────────────────
  buildPath(config) {
    const elements = [];
    for (const ref of config.elements) {
      const el = resolveElement(ref);
      if (!el) return null;
      elements.push(el);
    }
    if (elements.length < 2) return null;
    const borderRadii = elements.map((el) => getBorderRadius(el));
    const trackStyle = {
      ...DEFAULT_TRACK_STYLE,
      ...this.opts.trackStyle,
      ...config.trackStyle
    };
    const segments = config.segments ?? this.opts.segments ?? DEFAULT_SEGMENTS;
    const hugRaw = config.contourHug ?? this.opts.contourHug;
    const hugGap = hugRaw === true ? 6 : typeof hugRaw === "number" ? hugRaw : 0;
    const d = this._computeD(elements, borderRadii, config, hugGap);
    const group = createSVGEl("g");
    group.setAttribute("class", "svgflow-path");
    const trackPaths = this.buildTrackPaths(d, trackStyle);
    for (const tp of trackPaths) group.appendChild(tp);
    const fallbackColor = trackStyle.color;
    const segmentPaths = [];
    const segmentStates = [];
    for (const seg of segments) {
      const sp = this.buildSegmentPath(d, seg, fallbackColor);
      group.appendChild(sp);
      segmentPaths.push(sp);
      segmentStates.push({ offset: 0, createdAt: performance.now() });
    }
    this.svg.appendChild(group);
    const pathLength = trackPaths[0].getTotalLength?.() ?? 1e3;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const state = segmentStates[i];
      state.offset = seg.startOffset ?? -(pathLength * 0.5 + i * 150);
      segmentPaths[i].setAttribute("stroke-dashoffset", String(state.offset));
    }
    return { config, elements, borderRadii, group, trackPaths, segmentPaths, pathLength, segmentStates };
  }
  // ── Refresh (recompute d from current DOM layout) ─────────────────────────
  refreshPath(resolved) {
    const { elements, borderRadii, config } = resolved;
    const hugRaw = config.contourHug ?? this.opts.contourHug;
    const hugGap = hugRaw === true ? 6 : typeof hugRaw === "number" ? hugRaw : 0;
    const d = this._computeD(elements, borderRadii, config, hugGap);
    for (const p of resolved.trackPaths) p.setAttribute("d", d);
    for (const p of resolved.segmentPaths) p.setAttribute("d", d);
  }
  remeasureLength(resolved) {
    resolved.pathLength = resolved.trackPaths[0].getTotalLength?.() ?? resolved.pathLength;
  }
  // ── Private helpers ────────────────────────────────────────────────────────
  _computeD(elements, borderRadii, config, hugGap) {
    const rects = elements.map((el) => getAbsoluteRect(el));
    const hugDir = config.hugDirection ?? this.opts.hugDirection ?? "short";
    return routePath(
      rects,
      borderRadii,
      config.cornerStyle ?? this.opts.cornerStyle,
      config.cornerRadius ?? this.opts.cornerRadius,
      config.bends ?? this.opts.bends,
      hugGap,
      hugDir,
      // Used exactly as given (default 30) — no implicit width-coupling, so an
      // explicit value always means what it says. Callers that want a
      // width-derived threshold compute it themselves.
      config.nearThreshold ?? this.opts.nearThreshold
    );
  }
  removePath(resolved) {
    resolved.group.remove();
  }
  destroy() {
    this.svg.remove();
    this.glowFilters.clear();
  }
  get svgEl() {
    return this.svg;
  }
};

// src/animator.ts
var applyEasing = (easing, baseVelocity, t, seg) => {
  switch (easing) {
    case "linear":
      return baseVelocity;
    case "wave": {
      const period = seg.wavePeriod ?? 2e3;
      const amplitude = seg.waveAmplitude ?? 1.5;
      const factor = Math.max(0, 1 + amplitude * Math.sin(t % period / period * Math.PI * 2));
      return baseVelocity * factor;
    }
    case "pulse": {
      const on = seg.pulseOn ?? 400;
      const off = seg.pulseOff ?? 800;
      return t % (on + off) < on ? baseVelocity : 0;
    }
    case "ease-in": {
      const ramp = Math.min(t / 1e3, 1);
      return baseVelocity * ramp * ramp;
    }
    case "ease-out": {
      const ramp = Math.min(t / 1e3, 1);
      return baseVelocity * (1 - (1 - ramp) * (1 - ramp));
    }
    case "ease-in-out": {
      const ramp = Math.min(t / 1e3, 1);
      const s = ramp < 0.5 ? 2 * ramp * ramp : 1 - Math.pow(-2 * ramp + 2, 2) / 2;
      return baseVelocity * s;
    }
    default:
      return baseVelocity;
  }
};
var Animator = class {
  constructor(opts) {
    this.paths = [];
    this.renderer = null;
    this.boost = 0;
    this.lastScrollY = 0;
    this.rafId = null;
    this.paused = false;
    this.tick = () => {
      this.rafId = requestAnimationFrame(this.tick);
      this.boost *= this.opts.friction;
      if (Math.abs(this.boost) < 1e-3) this.boost = 0;
      const now = performance.now();
      for (const path of this.paths) {
        const connBoost = path.config.scrollMultiplier != null ? this.boost * (path.config.scrollMultiplier / this.opts.scrollMultiplier) : this.boost;
        const connBase = path.config.baseSpeed ?? this.opts.baseSpeed;
        const connVelocity = connBase + connBoost;
        const segments = path.config.segments ?? this.opts.segments ?? DEFAULT_SEGMENTS;
        for (let i = 0; i < path.segmentPaths.length; i++) {
          const seg = segments[i];
          if (!seg) continue;
          const state = path.segmentStates[i];
          const svgPath = path.segmentPaths[i];
          const t = now - state.createdAt;
          const rawVelocity = connVelocity * (seg.speedMultiplier ?? 1) + (seg.baseSpeedOffset ?? 0);
          const easedVelocity = applyEasing(seg.easing ?? "linear", rawVelocity, t, seg);
          state.offset -= easedVelocity;
          svgPath.setAttribute("stroke-dashoffset", String(state.offset));
        }
      }
    };
    this.opts = opts;
    this.scrollTarget = opts.scrollContainer;
    this.onScroll = () => {
      const currentY = this.scrollTarget === window ? window.scrollY : this.scrollTarget.scrollTop;
      const delta = currentY - this.lastScrollY;
      this.lastScrollY = currentY;
      if (!this.opts.accelerateOnScroll) return;
      if (!this.opts.reverseOnScrollUp && delta < 0) return;
      this.boost += delta * this.opts.scrollMultiplier;
    };
    this.scrollTarget.addEventListener("scroll", this.onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => {
      this.renderer?.updateViewBox();
      for (const path of this.paths) {
        this.renderer?.refreshPath(path);
        this.renderer?.remeasureLength(path);
      }
    });
    this.resizeObserver.observe(document.documentElement);
  }
  setPaths(paths) {
    this.paths = paths;
  }
  setRenderer(renderer) {
    this.renderer = renderer;
  }
  start() {
    if (this.rafId !== null) return;
    this.paused = false;
    this.tick();
  }
  pause() {
    this.paused = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.tick();
  }
  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.scrollTarget.removeEventListener("scroll", this.onScroll);
    this.resizeObserver.disconnect();
    this.paths = [];
  }
};

// src/index.ts
var DEFAULTS = {
  paths: [],
  trackStyle: DEFAULT_TRACK_STYLE,
  segments: DEFAULT_SEGMENTS,
  cornerStyle: "rounded",
  cornerRadius: 20,
  bends: "auto",
  contourHug: false,
  hugDirection: "short",
  nearThreshold: 30,
  scrollMultiplier: 0.06,
  friction: 0.92,
  baseSpeed: 0.8,
  accelerateOnScroll: true,
  reverseOnScrollUp: true,
  zIndex: -1,
  pauseWhenHidden: true,
  reducedMotion: true,
  scrollContainer: typeof window !== "undefined" ? window : null
};
var SvgFlow = class {
  constructor(options) {
    this.paths = [];
    if (isSSR()) {
      throw new Error("[SvgFlow] Cannot be instantiated in a non-browser environment.");
    }
    this.opts = {
      ...DEFAULTS,
      ...options,
      trackStyle: { ...DEFAULTS.trackStyle, ...options.trackStyle },
      scrollContainer: options.scrollContainer ?? window
    };
    if (this.opts.reducedMotion && prefersReducedMotion()) {
      this.opts.baseSpeed = 0;
      this.opts.scrollMultiplier = 0;
    }
    this.renderer = new Renderer(this.opts);
    this.animator = new Animator(this.opts);
    this.animator.setRenderer(this.renderer);
    for (const config of options.paths) {
      this._buildPath(config);
    }
    this.animator.setPaths(this.paths);
    this.animator.start();
    this.visibilityHandler = () => {
      if (!this.opts.pauseWhenHidden) return;
      document.hidden ? this.animator.pause() : this.animator.resume();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }
  _buildPath(config) {
    const resolved = this.renderer.buildPath(config);
    if (resolved) this.paths.push(resolved);
  }
  addPath(config) {
    this._buildPath(config);
    this.animator.setPaths(this.paths);
  }
  removePath(index) {
    const resolved = this.paths[index];
    if (!resolved) return;
    this.renderer.removePath(resolved);
    this.paths.splice(index, 1);
    this.animator.setPaths(this.paths);
  }
  pause() {
    this.animator.pause();
  }
  resume() {
    this.animator.resume();
  }
  /**
   * Recompute every path's geometry from the current DOM layout and update the
   * SVG viewBox. Call this after moving/resizing connected elements in a way
   * that doesn't change the document size (which the internal ResizeObserver
   * already handles) — e.g. dragging an absolutely-positioned node.
   */
  refresh() {
    this.renderer.updateViewBox();
    for (const path of this.paths) {
      this.renderer.refreshPath(path);
      this.renderer.remeasureLength(path);
    }
  }
  destroy() {
    this.animator.destroy();
    this.renderer.destroy();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.paths = [];
  }
};
export {
  DEFAULT_SEGMENTS,
  DEFAULT_TRACK_STYLE,
  SvgFlow,
  __debugRoute,
  effectiveRadii,
  routePath
};
//# sourceMappingURL=svgflow.js.map