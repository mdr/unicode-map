import { hex, type UnicodeData } from "../../data/unicode"
import { MONO_FONT } from "./constants"
import type { CodePoint } from "../../units"

/** Placeholder for a code point with no visible glyph: a dashed box with its abbreviation. */
export const drawSpecial = (
  ctx: CanvasRenderingContext2D,
  data: UnicodeData,
  cp: CodePoint,
  sx: number,
  k: number,
  cy: number,
  alpha: number,
  dark: boolean
): void => {
  const gc = data.gc(cp).code
  let label: string | undefined
  if (gc === "Co") label = "PUA"
  else if (gc === "Cs") label = "SUR"
  else label = data.abbr(cp) ?? hex(cp)
  if (!label) return
  const bw = k * 0.62
  const bh = k * 0.36
  ctx.globalAlpha = alpha * 0.8
  ctx.strokeStyle = dark ? "rgba(13,16,23,0.7)" : "#8b95a8"
  ctx.lineWidth = Math.max(1, k * 0.012)
  ctx.setLineDash([Math.max(2, k * 0.03), Math.max(2, k * 0.03)])
  ctx.strokeRect(sx + (k - bw) / 2, cy - bh / 2, bw, bh)
  ctx.setLineDash([])
  ctx.fillStyle = dark ? "#0d1017" : "#c9d0dc"
  ctx.font = `600 ${Math.min(bh * 0.55, (bw / label.length) * 1.5)}px ${MONO_FONT}`
  ctx.fillText(label, sx + k / 2, cy + 1)
}

/** Break text into at most `maxLines` lines no wider than `maxW` in the current font, ending in … if cut. */
const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] => {
  const lines: string[] = []
  let cur = ""
  for (const w of text.split(" ")) {
    const next = cur ? cur + " " + w : w
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur)
      cur = w
    } else cur = next
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    lines.length = maxLines
    const last = lines[maxLines - 1]
    if (last !== undefined) lines[maxLines - 1] = `${last}…`
  }
  return lines
}

/** Draw text wrapped into lines, centred vertically on y. */
export const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number
): void => {
  const lines = wrapLines(ctx, text, maxW, maxLines)
  const startY = y - ((lines.length - 1) * lineH) / 2
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineH, maxW))
}

/** Truncate text with an ellipsis to fit a width in the current font. */
export const ellipsize = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string => {
  if (ctx.measureText(text).width <= maxW) return text
  let lo = 0,
    hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid).trimEnd() + "…").width <= maxW) lo = mid
    else hi = mid - 1
  }
  return lo ? text.slice(0, lo).trimEnd() + "…" : ""
}
