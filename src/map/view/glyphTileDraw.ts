import { displayString, type UnicodeData } from "../../data/unicode"
import { drawSpecial } from "./text"
import type { CodePoint, Plane } from "../../units"
import { glyphScale } from "./glyphFit"

/** Smallest size glyphs are drawn at; smaller tiles are drawn at this size and scaled down. */
const GLYPH_DRAW_MIN = 6

/** Draw one row of a tile's code points; returns the canvas, created on the first thing to draw. */
const drawTileRow = (
  data: UnicodeData,
  rowCp: CodePoint,
  y: number,
  res: number,
  span: number,
  cv: HTMLCanvasElement | undefined
): HTMLCanvasElement | undefined => {
  let c = cv?.getContext("2d")
  let lastFont = ""
  for (let x = 0; x < span; x++) {
    const cp = rowCp | x
    const str = displayString(data, cp)
    if (!str && !data.isAssigned(cp)) continue
    if (!c) {
      cv = document.createElement("canvas")
      cv.width = cv.height = span * res
      c = cv.getContext("2d")!
      c.textAlign = "center"
      c.textBaseline = "middle"
      c.fillStyle = "#eef1f6"
    }
    // Same size and position as on the cards, so the switch to real rendering is seamless.
    if (!str) {
      // No visible glyph (spaces, format characters, private use…): the cards' placeholder.
      drawSpecial(c, data, cp, x * res, res, y * res + res * 0.53, 1, false)
      c.fillStyle = "#eef1f6"
      lastFont = ""
      continue
    }
    const family = data.glyphFamily(cp)
    const font = `${res * 0.5}px ${family}`
    if (font !== lastFont) c.font = lastFont = font
    const scale = glyphScale(c, cp, str, res * 0.5)
    if (scale < 1) c.font = lastFont = `${res * 0.5 * scale}px ${family}`
    c.globalAlpha = 1
    c.fillText(str, x * res + res / 2, y * res + res * 0.53)
  }
  return cv
}

/** Draw a tile at a legible size and average it down to `res`. */
const buildSmallTile = (
  data: UnicodeData,
  p: Plane,
  ty: number,
  tx: number,
  res: number,
  span: number
): HTMLCanvasElement | undefined => {
  const big = buildGlyphTile(data, p, ty, tx, GLYPH_DRAW_MIN, span)
  if (!big) return undefined
  const cv = document.createElement("canvas")
  cv.width = cv.height = span * res
  const c = cv.getContext("2d")!
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = "high"
  c.drawImage(big, 0, 0, cv.width, cv.height)
  big.width = big.height = 0
  return cv
}

/** Draw one tile: `span`×`span` code points at `res` pixels each. Undefined if there's nothing to draw. */
export const buildGlyphTile = (
  data: UnicodeData,
  p: Plane,
  ty: number,
  tx: number,
  res: number,
  span: number
): HTMLCanvasElement | undefined => {
  // Fonts don't draw usefully at a pixel or two.
  if (res < GLYPH_DRAW_MIN) return buildSmallTile(data, p, ty, tx, res, span)
  let cv: HTMLCanvasElement | undefined = undefined
  for (let y = 0; y < span; y++)
    cv = drawTileRow(data, (p << 16) | ((ty * span + y) << 8) | (tx * span), y, res, span, cv)
  return cv
}
