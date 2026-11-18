import { useEffect, useState } from "react"
import type { Detail } from "../../data/unicode"
import { AboutCards, blockScript, CharAboutCard } from "../About"
import { Section } from "./Rows"
import { Unassigned } from "./Unassigned"
import { Unihan } from "./Unihan"
import { Encodings } from "./Encodings"
import { CharacterHero } from "./CharacterHero"
import { WhereItLives } from "./WhereItLives"
import { NamesNotes } from "./NamesNotes"
import { RelatedCharacters } from "./RelatedCharacters"
import { Properties } from "./Properties"
import { PrivateUse } from "./PrivateUse"
import type { DetailProps } from "./detailProps"
import type { CodePoint } from "../../units"

export const CodePointDetail = ({
  data,
  mode,
  cp,
  onSelect,
  onBlock,
  onPlane,
  onClose,
  onChart,
  onInterpretation
}: DetailProps & { cp: CodePoint }) => {
  // Loaded for this code point; a code point can have no detail entry at all.
  const [loaded, setLoaded] = useState<{ cp: CodePoint; detail: Detail | undefined }>()
  useEffect(() => {
    let live = true
    void data.detail(cp).then((detail) => live && setLoaded({ cp, detail }))
    return () => {
      live = false
    }
  }, [data, cp])

  const assigned = data.isAssigned(cp)
  const gc = data.gc(cp)
  const script = data.script(cp)
  const block = data.block(cp)
  const blockIndex = data.blockIdx[cp] ?? -1
  const loading = loaded?.cp !== cp
  const d = (loading ? undefined : loaded.detail) ?? {}

  return (
    <div className="detail-scroll" key={cp}>
      <CharacterHero data={data} mode={mode} cp={cp} detail={d} onSelect={onSelect} onClose={onClose} />
      {!assigned && <Unassigned data={data} cp={cp} />}
      {gc.code === "Co" && <PrivateUse data={data} cp={cp} onInterpretation={onInterpretation} />}
      {assigned && <CharAboutCard cp={cp} />}
      <WhereItLives data={data} cp={cp} detail={d} onPlane={onPlane} onBlock={onBlock} onChart={onChart} />
      {(assigned || block) && (
        <Section title="About">
          <AboutCards
            data={data}
            script={assigned ? script.code : block ? blockScript(data, blockIndex) : undefined}
            block={blockIndex}
          />
        </Section>
      )}

      <NamesNotes data={data} detail={d} onSelect={onSelect} />
      {d.unihan && <Unihan data={data} u={d.unihan} onSelect={onSelect} />}
      <RelatedCharacters data={data} cp={cp} detail={d} onSelect={onSelect} />
      {gc.code !== "Cs" && <Encodings cp={cp} />}
      {assigned && <Properties data={data} detail={d} loading={loading} />}
    </div>
  )
}
