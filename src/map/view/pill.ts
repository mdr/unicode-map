import { UI_FONT } from "./constants"
import { ellipsize } from "./text"

export interface PillStyle {
  size: number
  bold: boolean
  fill: string
  ink: string
  dot?: string
  border?: string
  minChars?: number
}

/** A pill's label, cut to fit `room`, and its width; undefined if it doesn't fit. Sets the font. */
const layoutPill = (
  ctx: CanvasRenderingContext2D,
  text: string,
  room: number,
  opts: PillStyle
): { label: string; padX: number; dotW: number; w: number } | undefined => {
  const { size } = opts
  ctx.font = `${opts.bold ? 650 : 500} ${size}px ${UI_FONT}`
  const padX = size * 0.6,
    dotW = opts.dot ? size * 0.85 : 0
  const maxText = room - 2 * padX - dotW - 4
  if (maxText < size * 2) return undefined
  const label = ellipsize(ctx, text, maxText)
  // A stub like "Co…" says nothing: leave just the divider.
  if (label !== text && label.length - 1 < Math.min(opts.minChars ?? 7, text.length)) return undefined
  return { label, padX, dotW, w: ctx.measureText(label).width + 2 * padX + dotW }
}

/** Width a pill would take (0 if it doesn't fit in `room`), without drawing it. */
export const measurePill = (ctx: CanvasRenderingContext2D, text: string, room: number, opts: PillStyle): number =>
  layoutPill(ctx, text, room, opts)?.w ?? 0

/** Draw a rounded label at (x, its vertical centre y); returns its width, or 0 if it didn't fit. */
export const pill = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  room: number,
  opts: PillStyle
): number => {
  const lay = layoutPill(ctx, text, room, opts)
  if (!lay) return 0
  const { label, padX, dotW, w } = lay
  const { size } = opts
  const h = Math.round(size * 1.6)
  const top = Math.round(y - h / 2)
  ctx.fillStyle = opts.fill
  ctx.beginPath()
  ctx.roundRect(Math.round(x), top, w, h, h / 2)
  ctx.fill()
  if (opts.border) {
    ctx.strokeStyle = opts.border
    ctx.lineWidth = 1
    ctx.stroke()
  }
  if (opts.dot) {
    ctx.fillStyle = opts.dot
    ctx.beginPath()
    ctx.arc(x + padX + size * 0.3, y, size * 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = opts.ink
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(label, x + padX + dotW, y + 0.5)
  return w
}
