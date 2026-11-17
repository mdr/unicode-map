import { required } from "../../required"
import type { Plane } from "../../units"

/** A level of the glyph tile pyramid. */
export interface GlyphLevel {
  /** Device pixels per code point. */
  res: number
  /** Code points per tile side. */
  span: number
  /** Whether `pnpm tiles` pre-builds this level as WebP files. */
  prebuilt: boolean
}

/** @public Also read by scripts/build_tiles.ts, inside the page, which pre-builds the levels marked so. */
export const GLYPH_LEVELS: GlyphLevel[] = [
  // Below a few pixels a glyph is a smudge, but how much ink it has still shows: dense ideographs
  // bright, marks and punctuation faint, emoji in colour. That texture is the point of this level.
  { res: 2, span: 128, prebuilt: true },
  { res: 6, span: 64, prebuilt: true },
  { res: 12, span: 32, prebuilt: true },
  { res: 24, span: 16, prebuilt: true },
  { res: 48, span: 16, prebuilt: false }
]
/** The finest level, for zoom beyond all of them. */
export const FINEST_GLYPH_LEVEL = required(GLYPH_LEVELS.at(-1), "glyph levels")

export const tileKey = (res: number, p: Plane, ty: number, tx: number): string => `${res}:${p}:${ty}:${tx}`
