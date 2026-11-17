import type { UnicodeData } from "../../data/unicode"

export const Unassigned = ({ data, cp }: { data: UnicodeData; cp: number }) => {
  const nonchar = data.nonchar[cp]
  const block = data.block(cp)
  return (
    <div className="callout">
      {nonchar ? (
        <>
          <b>Noncharacter.</b> Permanently reserved for internal use by applications; it will never be assigned a
          character.
        </>
      ) : block ? (
        <>
          <b>Reserved.</b> This code point sits inside the <i>{block.name}</i> block but has no character assigned yet.
        </>
      ) : (
        <>
          <b>Unallocated.</b> No block has been allocated here yet. It is available for future versions of Unicode.
        </>
      )}
    </div>
  )
}
