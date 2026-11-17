import { displayString, type UnicodeData } from "../../data/unicode"
import { MONO_FONT } from "./constants"

/** Loads the font faces for rows of 256 code points on demand, and says when they're ready. */
export class RowFonts {
  private loadedRows = new Set<number>()
  private pendingRows = new Set<number>()
  private lastResortReady = false

  constructor(
    private data: UnicodeData,
    private invalidate: () => void
  ) {
    void document.fonts.load(`16px "UMap Last Resort"`, "A").then(() => {
      this.lastResortReady = true
      invalidate()
    })
  }

  /** Ask the browser to load the font faces needed for a row; returns whether they're ready. */
  ensureRow(rowCp: number): boolean {
    const row = rowCp >> 8
    if (this.loadedRows.has(row)) return this.lastResortReady
    if (!this.pendingRows.has(row)) {
      this.pendingRows.add(row)
      const done = (): void => {
        this.pendingRows.delete(row)
        this.loadedRows.add(row)
        this.invalidate()
      }
      Promise.all([...this.rowFamilies(rowCp)].map(([fam, s]) => document.fonts.load(`32px ${fam}`, s))).then(
        done,
        done
      )
    }
    return false
  }

  /** A row's characters grouped by font family. */
  private rowFamilies(rowCp: number): Map<string, string> {
    const byFamily = new Map<string, string>()
    for (let i = 0; i < 256; i++) {
      const cp = rowCp | i
      const str = displayString(this.data, cp)
      if (!str) continue
      const fam = this.data.glyphFamily(cp)
      byFamily.set(fam, (byFamily.get(fam) ?? "") + str)
    }
    return byFamily
  }

  /** Whether the fonts for `rows` rows of a plane, from row `y0`, are loaded (asking for them if not). */
  tilesReady(p: number, y0: number, rows: number): boolean {
    // The placeholders' labels use the monospace interface font.
    let ready = document.fonts.check(`12px ${MONO_FONT}`, "WJ")
    if (!ready) void document.fonts.load(`12px ${MONO_FONT}`, "WJ").then(() => this.invalidate())
    for (let r = 0; r < rows; r++) if (!this.ensureRow((p << 16) | ((y0 + r) << 8))) ready = false
    return ready
  }
}
