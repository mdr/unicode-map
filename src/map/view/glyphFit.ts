import type { CSSProperties } from "react"
import type { CodePoint } from "../../units"

/**
 * A glyph's ink on the canvas, in ems of its drawn size: (dx, dy) moves it so its ink, not its
 * font's em box, is centred, as a glyph whose ink sits high in its font (Tibetan ༀ) otherwise
 * looks high; `halfW` and `halfH` are the ink's half-size, for shrinking the rare glyph too big
 * for its room (U+FDFD, cuneiform, some Brahmic vowels, tall marks such as U+2E0E).
 */
export interface CanvasInk {
  dx: number
  dy: number
  halfW: number
  halfH: number
}

const inks = new Map<CodePoint, CanvasInk>()

/**
 * Measured with the context's current font, of size `em`, with textAlign "center" and
 * textBaseline "middle"; once per code point, as it doesn't depend on the size. Call only once
 * the glyph's font has loaded.
 */
export const canvasInk = (ctx: CanvasRenderingContext2D, cp: CodePoint, str: string, em: number): CanvasInk => {
  const known = inks.get(cp)
  if (known) return known
  const m = ctx.measureText(str)
  const ink = {
    dx: (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2 / em,
    dy: (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 / em,
    halfW: (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / 2 / em,
    halfH: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 2 / em
  }
  inks.set(cp, ink)
  return ink
}

/** The factor to shrink a glyph drawn at `em` pixels by so its centred ink reaches no further than (x, y) pixels. */
export const fitScale = (ink: CanvasInk, em: number, reach: { x: number; y: number }): number =>
  Math.min(1, reach.x / (ink.halfW * em), reach.y / (ink.halfH * em))

let measurer: CanvasRenderingContext2D | undefined

/**
 * A glyph's ink as the page lays it out, in ems. The page centres a glyph's line box (the font's
 * ascent and descent), not its ink, so a glyph whose ink sits high in its font, such as Tibetan
 * ༀ, looks high. `dx` and `dy` move the ink to the centre; `halfW` and `halfH` are its half-size.
 */
export interface PageInk {
  dx: number
  dy: number
  halfW: number
  halfH: number
}

const pageInks = new Map<CodePoint, PageInk>()

/** A glyph's ink in the page's fonts, or undefined until its font has loaded (which this starts). */
export const pageInk = (cp: CodePoint, str: string, family: string): PageInk | undefined => {
  const known = pageInks.get(cp)
  if (known) return known
  const em = 100
  const font = `${em}px ${family}`
  if (!document.fonts.check(font, str)) {
    void document.fonts.load(font, str)
    return undefined
  }
  measurer ??= document.createElement("canvas").getContext("2d") ?? undefined
  if (!measurer) return undefined
  measurer.font = font
  measurer.textAlign = "center"
  measurer.textBaseline = "alphabetic"
  const m = measurer.measureText(str)
  // The baseline sits (ascent − descent) / 2 below the line box's centre; the ink's centre is
  // (ink ascent − ink descent) / 2 above the baseline.
  const below =
    (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent - m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 2
  const ink = {
    dx: (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2 / em,
    dy: -below / em,
    halfW: (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / 2 / em,
    halfH: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 2 / em
  }
  pageInks.set(cp, ink)
  return ink
}

/** Style that centres a glyph's ink in its box, shrunk if needed to reach no more than `reach` ems from the centre. */
export const centredInkStyle = (ink: PageInk | undefined, reach: { x: number; y: number }): CSSProperties => {
  if (!ink) return {}
  const scale = Math.min(1, reach.x / ink.halfW, reach.y / ink.halfH)
  return {
    fontSize: scale < 1 ? `${scale}em` : undefined,
    transform: `translate(${ink.dx.toFixed(3)}em, ${ink.dy.toFixed(3)}em)`
  }
}
