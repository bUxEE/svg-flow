import type { AbsoluteRect } from './types.js'

export const getAbsoluteRect = (el: HTMLElement): AbsoluteRect => {
  const r = el.getBoundingClientRect()
  const scrollY = window.scrollY
  const scrollX = window.scrollX
  return {
    left: r.left + scrollX,
    top: r.top + scrollY,
    right: r.right + scrollX,
    bottom: r.bottom + scrollY,
    width: r.width,
    height: r.height,
  }
}

export const resolveElement = (ref: string | HTMLElement): HTMLElement | null => {
  if (typeof ref === 'string') {
    return document.querySelector<HTMLElement>(ref)
  }
  return ref
}

export const debounce = <T extends (...args: unknown[]) => void>(fn: T, ms: number): T => {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: unknown[]) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }) as T
}

/**
 * Stable 6-char hex hash for a color string — used to key glow filter IDs.
 * Not cryptographic, just needs to be stable and collision-resistant enough
 * for a handful of colors.
 */
export const colorHash = (color: string): string => {
  let hash = 0
  for (let i = 0; i < color.length; i++) {
    hash = (hash << 5) - hash + color.charCodeAt(i)
    hash |= 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6)
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v))

/** Read the CSS border-radius of an element (top-left corner value, in px). */
export const getBorderRadius = (el: HTMLElement): number => {
  const raw = window.getComputedStyle(el).borderRadius
  return parseFloat(raw) || 0
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** SVG namespace */
export const SVG_NS = 'http://www.w3.org/2000/svg'

export const createSVGEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
): SVGElementTagNameMap[K] => document.createElementNS(SVG_NS, tag)

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const isSSR = (): boolean => typeof window === 'undefined'
