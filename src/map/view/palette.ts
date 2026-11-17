import { type ColorMode, PLANE_BG, type RGB } from "../colorModes"
import { PURE_CELL, V_NONCHAR } from "./constants"

/** Per value of a colour mode: its colours on the map, and how text on it is inked. */
export interface Palette {
  /** Colours of lit cells. */
  colors: RGB[]
  /** Colours of dimmed cells. */
  dimmed: RGB[]
  fullColors: string[]
  dimColors: string[]
  /** Whether text on a card of that colour should be dark (the colour is light). */
  inkDark: boolean[]
  /** Whether it's highlighted by the legend (all are when nothing is). */
  valueOn: Uint8Array
}

const dim = (c: RGB): RGB => [
  Math.round(PLANE_BG[0] + (c[0] - PLANE_BG[0]) * 0.16),
  Math.round(PLANE_BG[1] + (c[1] - PLANE_BG[1]) * 0.16),
  Math.round(PLANE_BG[2] + (c[2] - PLANE_BG[2]) * 0.16)
]
const lum = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
const css = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`

export const buildPalette = (mode: ColorMode, pure: boolean, hl: Set<number> | undefined): Palette => {
  // Pure view: every assigned code point the same neutral grey, reserved ones background.
  const base = pure ? mode.colors.map((_, v): RGB => (v <= V_NONCHAR ? PLANE_BG : PURE_CELL)) : mode.colors
  const dimmed = base.map(dim)
  // Highlighted values that are normally drawn near-black (reserved code points, noncharacters,
  // dark legend entries) light up while highlighted, or highlighting them would show nothing.
  const colors = base.map((c, v): RGB => {
    if (!hl?.has(v) || lum(c) >= 70) return c
    if (v === V_NONCHAR) return [226, 92, 128]
    return c.map((x) => Math.round(x + (255 - x) * 0.55)) as RGB
  })
  const valueOn = new Uint8Array(colors.length).fill(1)
  if (hl) for (let v = 0; v < valueOn.length; v++) valueOn[v] = hl.has(v) ? 1 : 0
  return {
    colors,
    dimmed,
    fullColors: colors.map(css),
    dimColors: dimmed.map(css),
    inkDark: colors.map((c) => lum(c) > 150),
    valueOn
  }
}

/** Before a colour mode is set. */
export const EMPTY_PALETTE: Palette = {
  colors: [],
  dimmed: [],
  fullColors: [],
  dimColors: [],
  inkDark: [],
  valueOn: new Uint8Array(0)
}
