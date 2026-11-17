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

/** A glyph's ink reach in the page's fonts, or undefined until its font has loaded (which this starts). */
export const pageInkReach = (str: string, family: string): InkReach | undefined => {
  const font = `100px ${family}`
  if (!document.fonts.check(font, str)) {
    void document.fonts.load(font, str)
    return undefined
  }
  measurer ??= document.createElement("canvas").getContext("2d") ?? undefined
  if (!measurer) return undefined
  measurer.font = font
  measurer.textAlign = "center"
  measurer.textBaseline = "middle"
  return inkReach(measurer, str, 100)
}

/** glyphScale for a glyph laid out in the page (chart view): 1 until its font has loaded. */
export const pageGlyphScale = (cp: CodePoint, str: string, family: string): number => {
  const known = scales.get(cp)
  if (known !== undefined) return known
  const reach = pageInkReach(str, family)
  if (!reach) return 1
  const scale = Math.max(reach.x, reach.y) > REACH ? REACH / Math.max(reach.x, reach.y) : 1
  scales.set(cp, scale)
  return scale
}
