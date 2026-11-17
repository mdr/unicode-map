import type { Block } from "../data/unicode"

const LAST_CP = 0x10ffff

/** The code point `delta` away, skipping unassigned ones if asked, kept within the code space. */
export const stepCodePoint = (
  from: number,
  delta: number,
  assignedOnly: boolean,
  isAssigned: (cp: number) => boolean
): number => {
  let cp = from
  do {
    cp += delta
  } while (assignedOnly && cp > 0 && cp < LAST_CP && !isAssigned(cp))
  return Math.max(0, Math.min(LAST_CP, cp))
}

/** Index of the next block after a code point, or the last one before it; -1 if there's none. */
export const neighbourBlock = (blocks: Block[], at: number, direction: 1 | -1): number =>
  direction === 1 ? blocks.findIndex((b) => b.s > at) : blocks.findLastIndex((b) => b.e < at)
