import type { UnicodeData } from "../../data/unicode"
import { required } from "../../required"
import type { ColorMode } from "../colorModes"
import type { Rect } from "../layout"
import type { PlaneBitmaps } from "./bitmaps"
import type { RowFonts } from "./fonts"
import type { MapGeometry } from "./geometry"
import type { GlyphTiles } from "./glyphTiles"
import type { InkedGlyphs } from "./inkedGlyphs"
import type { Palette } from "./palette"
import type { HeaderHit, Preview } from "./preview"
import type { Viewport } from "./viewport"
import type { CodePoint, BlockIndex } from "../../units"

/** What the map is set to show. */
export interface ViewState {
  mode: ColorMode | undefined
  highlight: Set<number> | undefined
  mask: Uint8Array | undefined
  /** Show Unicode as of this age index, or the current version if undefined. */
  asOf: number | undefined
  /** Pure view: no colour, labels or chrome; just the cells and their glyphs. */
  pure: boolean
  /** Show glyph texture from the tiles when zoomed out in the normal view. */
  glyphTexture: boolean
  selected: CodePoint | undefined
  hovered: number
  /** A range pointed out from the sidebar, or by hovering a header. */
  preview: Preview | undefined
  /** A block or section that was clicked: stays pointed out until you click elsewhere or press Esc. */
  pinned: Preview | undefined
  /** Headers drawn in the last frame (screen rects), for hover and click. */
  headerHits: HeaderHit[]
  /** Whether the current preview comes from hovering a header on the map (not the sidebar). */
  headerHover: boolean
}

/** Everything the render passes draw from. */
export interface Scene {
  ctx: CanvasRenderingContext2D
  data: UnicodeData
  vp: Viewport
  st: ViewState
  bm: PlaneBitmaps
  pal: Palette
  geo: MapGeometry
  fonts: RowFonts
  tiles: GlyphTiles
  inked: InkedGlyphs
  /** Index of the colour emoji font, if any. */
  colourFont: number
}

/** The planes in view this frame, and the visible world rect. */
export interface FrameView {
  planes: number[]
  vis: Rect
}

/** Whether a block exists in the version being shown. */
export const blockExists = (sc: Scene, i: BlockIndex): boolean =>
  sc.st.asOf === undefined || required(sc.geo.blockFirstAge[i], "block's first age") <= sc.st.asOf
