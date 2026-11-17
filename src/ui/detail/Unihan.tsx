import type { Detail, UnicodeData } from "../../data/unicode"
import { Glyph } from "../Glyph"
import { Section, Rows, Row } from "./Rows"
import { Related } from "./Related"
import type { CodePoint } from "../../units"

export const Unihan = ({
  data,
  u,
  onSelect
}: {
  data: UnicodeData
  u: NonNullable<Detail["unihan"]>
  onSelect: (cp: CodePoint) => void
}) => {
  const readings: [string, string | undefined][] = [
    ["Mandarin", u.mandarin],
    ["Cantonese", u.cantonese],
    ["Japanese", u.japanese ?? [u.jaOn, u.jaKun].filter(Boolean).join(" · ")],
    [
      "Korean",
      u.hangul
        ? `${u.hangul.replace(/:\S+/g, "")}${u.korean ? ` (${u.korean.toLowerCase()})` : ""}`
        : u.korean?.toLowerCase()
    ],
    ["Vietnamese", u.vietnamese]
  ]
  return (
    <Section title="CJK ideograph (Unihan)">
      {u.def && <p className="unihan-def">“{u.def}”</p>}
      <Rows>
        {readings
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Row key={k} label={k}>
              {v}
            </Row>
          ))}
        {u.radical && (
          <Row label="Radical">
            {u.radical.char && (
              <button className="link" onClick={() => onSelect(u.radical!.char!.codePointAt(0)!)}>
                <Glyph data={data} cp={u.radical.char.codePointAt(0)!} />
              </button>
            )}{" "}
            #{u.radical.num} + {u.radical.extra} strokes
          </Row>
        )}
        {u.strokes !== undefined && <Row label="Total strokes">{u.strokes}</Row>}
        {u.grade && <Row label="Grade level">{u.grade}</Row>}
      </Rows>
      {u.simplified && <Related label="Simplified form" cps={u.simplified} data={data} onSelect={onSelect} />}
      {u.traditional && <Related label="Traditional form" cps={u.traditional} data={data} onSelect={onSelect} />}
      {u.semantic && <Related label="Semantic variants" cps={u.semantic} data={data} onSelect={onSelect} />}
      {u.zvariant && <Related label="Z-variants" cps={u.zvariant} data={data} onSelect={onSelect} />}
    </Section>
  )
}
