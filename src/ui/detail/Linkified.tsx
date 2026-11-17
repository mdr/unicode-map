import { displayString, MAX_CP, type UnicodeData } from "../../data/unicode"
import { Glyph } from "../Glyph"
import type { CodePoint } from "../../units"

/** Turn code point references like "2026" or "(name - 2026)" inside NamesList notes into links. */
export const Linkified = ({
  text,
  data,
  onSelect
}: {
  text: string
  data: UnicodeData
  onSelect: (cp: CodePoint) => void
}) => {
  const parts = text.split(/\b([0-9A-F]{4,6})\b/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 && parseInt(p, 16) < MAX_CP ? (
          <button
            key={i}
            className="link mono"
            onClick={() => onSelect(parseInt(p, 16))}
            title={data.name(parseInt(p, 16))}
          >
            {p}
            {displayString(data, parseInt(p, 16)) && (
              <>
                {" "}
                <Glyph data={data} cp={parseInt(p, 16)} />
              </>
            )}
          </button>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}
