// Render router output to a static SVG file so the path shape can be eyeballed.
//   node test/render.mjs > test/preview.svg
import { __debugRoute } from '../dist/svgflow.js'

const mkRect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h })

const cases = [
  {
    name: 'basic-ABCD', color: '#00ffcc', cornerRadius: 24, hug: 10, br: 10, hugDir: 'long',
    rects: [mkRect(200,120,140,49), mkRect(600,400,140,49), mkRect(180,700,140,49), mkRect(500,1000,140,49)],
  },
  {
    name: 'collapse', color: '#f59e0b', cornerRadius: 16, hug: 8, br: 12, hugDir: 'short',
    rects: [mkRect(20,20,100,50), mkRect(400,240,100,50), mkRect(20,460,100,50)],
    ox: 620, oy: 40,
  },
  {
    name: 'detour', color: '#a78bfa', cornerRadius: 14, hug: 8, br: 12, hugDir: 'short',
    rects: [mkRect(300,300,200,60), mkRect(360,40,120,50), mkRect(360,560,120,50)],
    ox: 600, oy: 600,
  },
]

let body = ''
for (const c of cases) {
  const ox = c.ox ?? 0, oy = c.oy ?? 0
  const br = c.rects.map(() => c.br)
  const { d } = __debugRoute(c.rects, br, 'rounded', c.cornerRadius, 'auto', c.hug, c.hugDir)
  body += `<g transform="translate(${ox},${oy})">`
  body += `<text x="0" y="-12" fill="#888" font-size="14" font-family="monospace">${c.name}</text>`
  for (const r of c.rects) {
    body += `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="${c.br}" fill="#0d1117" stroke="${c.color}55"/>`
  }
  body += `<path d="${d}" fill="none" stroke="${c.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
  // mark entry/exit points
  body += `</g>`
}

console.log(`<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1240" viewBox="-40 -40 1240 1240" style="background:#05050d">${body}</svg>`)
