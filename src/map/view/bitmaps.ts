import { MAX_CP, type UnicodeData } from "../../data/unicode"
import { required } from "../../required"
import { PLANE_BG, type RGB } from "../colorModes"
import { PLANE_COUNT, PLANE_SIZE } from "../layout"
import { INK_DARK, INK_LIGHT, SPARSE_MAX, TILE } from "./constants"
import type { Palette } from "./palette"
import type { Plane } from "../../units"

/** What a code point is in the bitmaps being built, per plane. */
const NOT_YET = 0 // not encoded in the version shown
const DIM = 1
const LIT = 2
const CELLS = PLANE_SIZE * PLANE_SIZE
const TILES = PLANE_SIZE / TILE

/** What the bitmaps are built from, with per-value lookups made once per rebuild. */
interface Tables {
  data: UnicodeData
  valueOf: Uint16Array
  /** The property mask, or all ones. */
  mask: Uint8Array
  /** Code points newer than this age index aren't shown. */
  asOfLimit: number
  valueOn: Uint8Array
  colors: RGB[]
  /** Per value×2 + lit: the cell colour and the glyph ink (with alpha). */
  cellRGB: RGB[]
  inkRGBA: number[][]
  /** Font id + 1 of the colour emoji font, or -1. */
  colourId: number
}

// Standing in for "no mask" keeps the paint loop on one array type, which V8 runs measurably faster.
let ones: Uint8Array | undefined = undefined
const allOnes = (): Uint8Array => (ones ??= new Uint8Array(MAX_CP).fill(1))

const makeTables = (
  data: UnicodeData,
  valueOf: Uint16Array,
  pal: Palette,
  mask: Uint8Array | undefined,
  asOf: number | undefined,
  colourFont: number
): Tables => {
  const cellRGB: RGB[] = []
  const inkRGBA: number[][] = []
  pal.colors.forEach((c, v) => {
    cellRGB[v * 2] = required(pal.dimmed[v], "dimmed colour")
    cellRGB[v * 2 + 1] = c
    // Ink as on the cards: dark or light to suit the colour, faint when dimmed.
    inkRGBA[v * 2] = [...INK_LIGHT, 64]
    inkRGBA[v * 2 + 1] = [...(pal.inkDark[v] ? INK_DARK : INK_LIGHT), 255]
  })
  return {
    data,
    valueOf,
    mask: mask ?? allOnes(),
    asOfLimit: asOf ?? Infinity,
    valueOn: pal.valueOn,
    colors: pal.colors,
    cellRGB,
    inkRGBA,
    colourId: colourFont >= 0 ? colourFont + 1 : -1
  }
}

/**
 * Cell colours and glyph ink for one plane, noting which code points are lit, dim or not yet
 * encoded, and listing the lit ones (as plane offsets) in `litIdx`. Returns how many are lit.
 */
const paintCells = (
  base: number,
  t: Tables,
  state: Uint8Array,
  litIdx: Uint32Array,
  d: Uint8ClampedArray,
  id: Uint8ClampedArray
): number => {
  const { valueOf, mask, asOfLimit, valueOn, cellRGB, inkRGBA } = t
  const ageIdx = t.data.ageIdx
  let n = 0
  // Per code point: cp is below MAX_CP, so it's in ageIdx, valueOf and mask, and every value
  // valueOf gives has a colour.
  for (let i = 0; i < CELLS; i++) {
    const cp = base + i
    const o = i * 4
    if (ageIdx[cp]! > asOfLimit) {
      state[i] = NOT_YET
      d[o] = PLANE_BG[0]
      d[o + 1] = PLANE_BG[1]
      d[o + 2] = PLANE_BG[2]
      d[o + 3] = 255
      continue
    }
    const v = valueOf[cp]!
    const lit = valueOn[v] !== 0 && mask[cp] !== 0 ? 1 : 0
    state[i] = DIM + lit
    litIdx[n] = i
    n += lit
    const col = cellRGB[v * 2 + lit]!
    d[o] = col[0]
    d[o + 1] = col[1]
    d[o + 2] = col[2]
    d[o + 3] = 255
    const ink = inkRGBA[v * 2 + lit]!
    id[o] = ink[0]!
    id[o + 1] = ink[1]!
    id[o + 2] = ink[2]!
    id[o + 3] = ink[3]!
  }
  return n
}

/** Colour emoji get no ink (they're shown as drawn instead): mark them in their own image. */
const markColourGlyphs = (base: number, t: Tables, state: Uint8Array, id: Uint8ClampedArray): ImageData | undefined => {
  const fontIdx = t.data.fontIdx
  const colourId = t.colourId
  let colour: ImageData | undefined = undefined
  for (let i = 0; i < CELLS; i++) {
    if (fontIdx[base + i] !== colourId || state[i] === NOT_YET) continue
    const o = i * 4
    colour ??= new ImageData(PLANE_SIZE, PLANE_SIZE)
    colour.data[o + 3] = state[i] === LIT ? 255 : 64
    id[o] = id[o + 1] = id[o + 2] = id[o + 3] = 0
  }
  return colour
}

/** While highlighting: coarse tiles lit if any of their cells is, lit blocks, and the first few lit code points. */
const markLit = (
  base: number,
  t: Tables,
  litIdx: Uint32Array,
  count: number,
  tile: Uint8ClampedArray,
  blockLit: Uint8Array,
  sparse: number[]
): void => {
  const { valueOf, colors } = t
  const blockIdx = t.data.blockIdx
  for (let j = 0; j < count; j++) {
    const i = litIdx[j]!
    const cp = base + i
    if (sparse.length <= SPARSE_MAX) sparse.push(cp)
    const col = colors[valueOf[cp]!]!
    const to = ((((i >> 8) / TILE) | 0) * TILES + (((i & 255) / TILE) | 0)) * 4
    tile[to] = col[0]
    tile[to + 1] = col[1]
    tile[to + 2] = col[2]
    tile[to + 3] = 255
    const b = blockIdx[cp]!
    if (b >= 0) blockLit[b] = 1
  }
}

const canvasAt = (list: (HTMLCanvasElement | undefined)[], p: Plane, size: number): HTMLCanvasElement => {
  let cv = list[p]
  if (!cv) {
    cv = document.createElement("canvas")
    cv.width = cv.height = size
    list[p] = cv
  }
  return cv
}

/** The per-plane bitmaps the map is drawn from, one pixel per code point, rebuilt when what's shown changes. */
export class PlaneBitmaps {
  /** Cell colours. */
  planes: HTMLCanvasElement[] = []
  /** Coarse tiles lit if any cell in them matches the highlight. */
  tiles: HTMLCanvasElement[] = []
  /**
   * The ink each glyph is drawn in (dark or light to suit the cell colour, as on the cards) and
   * how strongly (faint if dimmed, none if not shown). Glyph tiles are recoloured with it in the
   * normal view.
   */
  ink: HTMLCanvasElement[] = []
  /**
   * Cells whose glyph is a colour emoji: the texture shows those as drawn rather than
   * recoloured, or they'd become solid ink silhouettes. Undefined for planes without any.
   */
  colour: (HTMLCanvasElement | undefined)[] = []
  /** Per block, whether any of it is lit, while highlighting. */
  blockLit: Uint8Array | undefined = undefined
  /** A handful of matches (noncharacters, a rare property…) get rings so they can be found. */
  sparseLit: number[] = []
  tilesOn = false
  private state = new Uint8Array(CELLS)
  private litIdx = new Uint32Array(CELLS)

  rebuild(
    data: UnicodeData,
    valueOf: Uint16Array,
    pal: Palette,
    opts: { highlight: boolean; mask: Uint8Array | undefined; asOf: number | undefined; colourFont: number }
  ): void {
    const t = makeTables(data, valueOf, pal, opts.mask, opts.asOf, opts.colourFont)
    // When something is highlighted, sparse matches vanish at low zoom (a plane is ~170px wide
    // for 256 cells), so also build coarse tiles that light up if any cell in them matches.
    const filtering = opts.highlight || opts.mask !== undefined
    this.blockLit = filtering ? new Uint8Array(data.meta.blocks.length) : undefined
    const sparse: number[] = []
    for (let p = 0; p < PLANE_COUNT; p++) this.rebuildPlane(p, t, sparse)
    this.tilesOn = filtering
    this.sparseLit = filtering && sparse.length <= SPARSE_MAX ? sparse : []
  }

  private rebuildPlane(p: Plane, t: Tables, sparse: number[]): void {
    const base = p << 16
    const cv = canvasAt(this.planes, p, PLANE_SIZE)
    const c = cv.getContext("2d")!
    const img = c.createImageData(PLANE_SIZE, PLANE_SIZE)
    const icv = canvasAt(this.ink, p, PLANE_SIZE)
    const ic = icv.getContext("2d")!
    const ink = ic.createImageData(PLANE_SIZE, PLANE_SIZE)
    const lit = paintCells(base, t, this.state, this.litIdx, img.data, ink.data)
    const colour = t.colourId >= 0 ? markColourGlyphs(base, t, this.state, ink.data) : undefined
    if (this.blockLit) {
      const tc = canvasAt(this.tiles, p, TILES).getContext("2d")!
      const tile = tc.createImageData(TILES, TILES)
      markLit(base, t, this.litIdx, lit, tile.data, this.blockLit, sparse)
      tc.putImageData(tile, 0, 0)
    }
    c.putImageData(img, 0, 0)
    ic.putImageData(ink, 0, 0)
    if (colour) canvasAt(this.colour, p, PLANE_SIZE).getContext("2d")!.putImageData(colour, 0, 0)
    else this.colour[p] = undefined
  }
}
