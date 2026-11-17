import { displayString, hex, type UnicodeData } from "../../data/unicode"
import { required } from "../../required"
import { planeOrigin, PLANE_SIZE } from "../layout"
import { HEX_START, MONO_FONT, NAME_START, PAGE_BG, smooth, UI_FONT } from "./constants"
import type { FrameView, Scene } from "./scene"
import { drawSpecial, wrapText } from "./text"
import type { CodePoint } from "../../units"
import { glyphFit } from "./glyphFit"

/** What drawing the cards needs, worked out once per frame. */
interface CellPass {
  ctx: CanvasRenderingContext2D
  data: UnicodeData
  valueOf: Uint16Array
  valueOn: Uint8Array
  fullColors: string[]
  dimColors: string[]
  inkDark: boolean[]
  mask: Uint8Array | undefined
  /** Whether cells can be dimmed by the legend or the property mask (not in pure view). */
  dimmable: boolean
  /** Whether highlighted reserved code points are shown lit. */
  litAbsent: boolean
  /** Code points newer than this age index don't exist yet. */
  asOfLimit: number
  k: number
  /** Card fade-in. */
  t: number
  gap: number
  /** Card side, inside the gaps. */
  side: number
  glyphPx: number
  /** Glyph centre, as a fraction of the cell from its top. */
  glyphDy: number
  glyphA: number
  glyphDimA: number
  specialA: number
  hexA: number
  nameA: number
  lastFont: string
}

const makePass = (sc: Scene, t: number): CellPass => {
  const { pure, glyphTexture, asOf, mask, highlight } = sc.st
  const k = sc.vp.cam.k
  const hexA = pure ? 0 : smooth(HEX_START, HEX_START * 1.3, k)
  const nameA = pure ? 0 : smooth(NAME_START, NAME_START * 1.3, k)
  const gap = Math.max(1, k * 0.04)
  const fade = glyphTexture ? 1 : t
  return {
    ctx: sc.ctx,
    data: sc.data,
    valueOf: required(sc.st.mode, "colour mode").valueOf,
    valueOn: sc.pal.valueOn,
    fullColors: sc.pal.fullColors,
    dimColors: sc.pal.dimColors,
    inkDark: sc.pal.inkDark,
    mask,
    dimmable: !pure,
    litAbsent: !pure && highlight !== undefined,
    asOfLimit: pure || asOf === undefined ? Infinity : asOf,
    k,
    t,
    gap,
    side: k - 2 * gap,
    // Once headers sit inside the top of rows (with the code points), glyphs shrink a little and
    // move down to leave them room.
    glyphPx: k * (0.5 - 0.06 * hexA),
    glyphDy: nameA > 0 ? 0.45 : 0.53,
    // Pure view: the glyph tiles already showed these at full strength, so no fade-in.
    glyphA: pure ? 1 : fade * 1,
    glyphDimA: pure ? 1 : fade * 0.25,
    specialA: pure || glyphTexture ? 1 : t,
    hexA,
    nameA,
    lastFont: ""
  }
}

/** A code point that doesn't exist (yet): an empty slot, or lit if the highlight picks it out. */
const drawEmpty = (c: CellPass, cp: CodePoint, v: number, sx: number, sy: number): void => {
  const ctx = c.ctx
  if (c.litAbsent && c.valueOn[v] && !c.data.isAssigned(cp) && c.mask?.[cp] !== 0) {
    // Highlighted reserved code point / noncharacter: shown lit, like its cell colour.
    ctx.globalAlpha = 1
    ctx.fillStyle = c.fullColors[v]!
  } else {
    ctx.globalAlpha = c.t
    ctx.fillStyle = c.data.nonchar[cp] ? "#2a1820" : "#12161e"
  }
  ctx.fillRect(sx + c.gap, sy + c.gap, c.side, c.side)
}

/** The code point and name under the glyph, at high zoom. */
const drawCaptions = (c: CellPass, cp: CodePoint, sx: number, sy: number, dim: boolean, dark: boolean): void => {
  const { ctx, k, t } = c
  if (c.hexA > 0) {
    ctx.globalAlpha = t * c.hexA * (dim ? 0.3 : 0.7)
    ctx.fillStyle = dark ? "#0d1017" : "#c4cad6"
    ctx.font = c.lastFont = `500 ${Math.min(14, k * 0.12)}px ${MONO_FONT}`
    ctx.fillText(hex(cp), sx + k / 2, sy + k * 0.88)
  }
  if (c.nameA > 0) {
    ctx.globalAlpha = t * c.nameA * (dim ? 0.3 : 0.85)
    ctx.fillStyle = dark ? "#0d1017" : "#dde2ea"
    const fs = Math.min(12, k * 0.075)
    ctx.font = c.lastFont = `500 ${fs}px ${UI_FONT}`
    wrapText(ctx, c.data.name(cp), sx + k / 2, sy + k * 0.72, k * 0.88, fs * 1.15, 2)
  }
}

/** A glyph in its font, its ink centred at (x, y); the rare one too big for its card is drawn smaller. */
const drawGlyph = (c: CellPass, cp: CodePoint, str: string, x: number, y: number): void => {
  const { ctx, glyphPx } = c
  const family = c.data.glyphFamily(cp)
  const font = `${glyphPx}px ${family}`
  if (font !== c.lastFont) ctx.font = c.lastFont = font
  const { scale, dx, dy } = glyphFit(ctx, cp, str, glyphPx)
  const size = glyphPx * scale
  if (scale < 1) ctx.font = c.lastFont = `${size}px ${family}`
  ctx.fillText(str, x + dx * size, y + dy * size)
}

/** A code point that exists: its card, in its cell's colour, with its glyph and captions. */
const drawCard = (c: CellPass, cp: CodePoint, v: number, sx: number, sy: number, rowReady: boolean): void => {
  const { ctx, k } = c
  const dim = c.dimmable && (!c.valueOn[v] || (c.mask !== undefined && !c.mask[cp]))
  ctx.globalAlpha = 1
  // Cards keep their cell's colour at every zoom; the ink is fixed per colour.
  ctx.fillStyle = dim ? c.dimColors[v]! : c.fullColors[v]!
  ctx.fillRect(sx + c.gap, sy + c.gap, c.side, c.side)
  const dark = !dim && c.inkDark[v]!
  const glyphY = sy + k * c.glyphDy
  const str = displayString(c.data, cp)
  if (!str) {
    drawSpecial(ctx, c.data, cp, sx, k, glyphY, c.specialA * (dim ? 0.3 : 1), dark)
    c.lastFont = ""
  } else if (rowReady) {
    ctx.globalAlpha = dim ? c.glyphDimA : c.glyphA
    ctx.fillStyle = dark ? "#0d1017" : "#eef1f6"
    drawGlyph(c, cp, str, sx + k / 2, glyphY)
  }
  if (c.hexA > 0 || c.nameA > 0) drawCaptions(c, cp, sx, sy, dim, dark)
}

/** One row of cells, from column x0 to x1 of plane row `rowCp`. */
const drawRow = (c: CellPass, sc: Scene, rowCp: CodePoint, ox: number, x0: number, x1: number, sy: number): void => {
  const rowReady = sc.fonts.ensureRow(rowCp)
  const { valueOf, data, asOfLimit, k } = c
  const ageIdx = data.ageIdx
  const { cx } = sc.vp.cam
  const halfW = sc.vp.w / 2
  for (let lx = x0; lx <= x1; lx++) {
    const cp = rowCp | lx
    // Per cell: cp is a code point, so valueOf and ageIdx have it, and the colour tables have its value.
    const v = valueOf[cp]!
    const sx = (ox + lx - cx) * k + halfW
    if (data.isAssigned(cp) && ageIdx[cp]! <= asOfLimit) drawCard(c, cp, v, sx, sy, rowReady)
    else drawEmpty(c, cp, v, sx, sy)
  }
}

/** Cards with glyphs, at high zoom, faded in by `t`. */
export const renderCells = (sc: Scene, { planes, vis }: FrameView, t: number): void => {
  const ctx = sc.ctx
  const vp = sc.vp
  const c = makePass(sc, t)
  const k = c.k
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const p of planes) {
    const o = planeOrigin(p)
    const x0 = Math.max(0, Math.floor(vis.x - o.x))
    const x1 = Math.min(PLANE_SIZE - 1, Math.floor(vis.x + vis.w - o.x))
    const y0 = Math.max(0, Math.floor(vis.y - o.y))
    const y1 = Math.min(PLANE_SIZE - 1, Math.floor(vis.y + vis.h - o.y))
    if (x0 > x1 || y0 > y1) continue
    // Cover the bitmap with a dark backdrop, faded in: it shows as the gaps between cards.
    ctx.globalAlpha = t
    ctx.fillStyle = PAGE_BG
    ctx.fillRect(vp.sx(o.x + x0), vp.sy(o.y + y0), (x1 - x0 + 1) * k, (y1 - y0 + 1) * k)
    for (let ly = y0; ly <= y1; ly++) drawRow(c, sc, (p << 16) | (ly << 8), o.x, x0, x1, vp.sy(o.y + ly))
  }
  ctx.globalAlpha = 1
}
