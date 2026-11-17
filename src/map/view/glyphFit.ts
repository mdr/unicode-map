import type { CSSProperties } from "react"
import type { CodePoint } from "../../units"

/**
 * How far a glyph's ink may reach from where it's drawn (its centre, with textAlign "center"
 * and textBaseline "middle"), in ems: inside the card, whose sides are about 0.94 em away.
 */
const REACH = 0.9

/** How far a glyph's ink reaches from its centre, sideways and up or down, in ems. */
interface InkReach {
  x: number
  y: number
}

const inkReach = (ctx: CanvasRenderingContext2D, str: string, em: number): InkReach => {
  const m = ctx.measureText(str)
  return {
    x: Math.max(m.actualBoundingBoxLeft, m.actualBoundingBoxRight) / em,
    y: Math.max(m.actualBoundingBoxAscent, m.actualBoundingBoxDescent) / em
  }
}

const scales = new Map<CodePoint, number>()

/**
 * The factor to shrink a glyph by so its ink stays on its card: 1 for almost every character;
 * less for the few hundred whose ink reaches further (wide ligatures such as U+FDFD, cuneiform,
 * some Brahmic vowels). Measured with the context's current font, of size `em`, once per code
 * point: the ratio doesn't depend on the size. Call only once the glyph's font has loaded.
 */
export const glyphScale = (ctx: CanvasRenderingContext2D, cp: CodePoint, str: string, em: number): number => {
  const known = scales.get(cp)
  if (known !== undefined) return known
  const { x, y } = inkReach(ctx, str, em)
  const reach = Math.max(x, y)
  const scale = reach > REACH ? REACH / reach : 1
  scales.set(cp, scale)
  return scale
}

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
