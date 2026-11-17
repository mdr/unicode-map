import { displayString, type UnicodeData } from "../data/unicode"
import type { CodePoint } from "../units"

/** A code point drawn with the font chosen for it, or its abbreviation for invisible characters. */
export const Glyph = ({ data, cp, className }: { data: UnicodeData; cp: CodePoint; className?: string }) => {
  const str = displayString(data, cp)
  if (str) {
    return (
      <span className={className} style={{ fontFamily: data.glyphFamily(cp) }}>
        {str}
      </span>
    )
  }
  const gc = data.gc(cp).code
  const abbr = data.abbr(cp) ?? (gc === "Co" ? "PUA" : gc === "Cs" ? "SUR" : "")
  return <span className={className}>{abbr && <span className="glyph-abbr">{abbr}</span>}</span>
}
