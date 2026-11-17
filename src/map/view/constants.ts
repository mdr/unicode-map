import type { RGB } from "../colorModes"

export const PAGE_BG = "#0b0e14"
export const UI_FONT = "Inter, ui-sans-serif, system-ui, sans-serif"
export const MONO_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

// Zoom thresholds (pixels per cell)
export const GRID_START = 5
export const CARD_START = 22
export const CARD_FULL = 36
export const HEX_START = 58
export const NAME_START = 120
export const AXIS_START = 13
/** The sticky axes: column numbers along the top, row numbers down the left (CSS px). */
export const AXIS_TOP = 20
export const AXIS_LEFT = 58
/** Zoom at which the dividers between chart sections appear. */
export const SECTION_START = 16
/**
 * Labels come in three steps as you zoom in, one kind at a time:
 * - landmarks: big names centred in blocks of several rows, while glyphs are too small to read;
 * - block names: a label at the start of every block, once rows are tall enough for one;
 * - section names: added once the cards with readable glyphs appear.
 * The landmark names fade out completely before the block labels fade in, so they never overlap.
 */
export const LANDMARK_END = 12
export const BLOCK_LABEL_START = 14
export const BLOCK_LABEL_FULL = 16
/** Zoom (CSS px per cell) at which block clicks land: glyph cards are fully drawn. */
export const READ_K = 40
/** Zoom (CSS px per code point) where glyph tiles start to fade in, and where they're fully in. */
export const GLYPH_TILE_START = 0.3
export const GLYPH_TILE_FULL = 0.6

/** Code points per side of a highlight tile at low zoom. */
export const TILE = 4
/** Value index of noncharacters in every colour mode (see colorModes). */
export const V_NONCHAR = 1
/** Highlights with at most this many matches are ringed at low zoom. */
export const SPARSE_MAX = 400
/** Glyph ink on light and dark cells (as on the cards). */
export const INK_DARK: RGB = [13, 16, 23]
export const INK_LIGHT: RGB = [238, 241, 246]
/** Cell colour of assigned code points in pure view. */
export const PURE_CELL: RGB = [52, 58, 71]

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
