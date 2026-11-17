import type { Detail, UnicodeData } from "../../data/unicode"
import { Section } from "./Rows"
import { Related } from "./Related"

/** Decomposition, case mappings, cross-references and confusables. */
export const RelatedCharacters = ({
  data,
  cp,
  detail: d,
  onSelect
}: {
  data: UnicodeData
  cp: number
  detail: Detail
  onSelect: (cp: number) => void
}) => {
  const hasCase = d.upper !== undefined || d.lower !== undefined || d.title !== undefined
  if (![d.seeAlso, d.confusables, d.confusableWith, d.decomp].some(Boolean) && !hasCase) return undefined
  return (
    <Section title="Related characters">
      {d.decomp && (
        <Related
          label={`Decomposes to${d.decomp.type !== "canonical" ? ` (${d.decomp.type})` : ""}`}
          cps={d.decomp.cps}
          data={data}
          onSelect={onSelect}
        />
      )}
      {hasCase && (
        <Related
          label="Case"
          cps={[d.upper, d.lower, d.title]
            .filter((c): c is number => c !== undefined && c !== cp)
            .filter((c, i, a) => a.indexOf(c) === i)}
          data={data}
          onSelect={onSelect}
        />
      )}
      {d.seeAlso && <Related label="See also" cps={d.seeAlso} data={data} onSelect={onSelect} />}
      {d.confusableWith && (
        <Related label="Can be confused with" cps={d.confusableWith} data={data} onSelect={onSelect} />
      )}
      {d.confusables && <Related label="Lookalikes" cps={d.confusables} data={data} onSelect={onSelect} />}
    </Section>
  )
}
