import type { Block, UnicodeData } from "./unicode"

export interface VersionStats {
  /** Characters added in each version (an index into meta.ages). */
  added: number[]
  /** Characters assigned as of each version. */
  total: number[]
  /** Blocks whose first characters came in each version, the biggest debut first. */
  newBlocks: { name: string; count: number }[][]
}

/** The version a block's first characters came in, and how many came then. */
const blockDebut = (data: UnicodeData, block: Block): { version: number; count: number } | undefined => {
  let version = Infinity
  let count = 0
  for (let cp = block.s; cp <= block.e; cp++) {
    if (!data.isAssigned(cp)) continue
    const age = data.ageIdx[cp]!
    if (age < version) {
      version = age
      count = 0
    }
    if (age === version) count++
  }
  return version === Infinity ? undefined : { version, count }
}

export const versionStats = (data: UnicodeData): VersionStats => {
  const added = new Array<number>(data.meta.ages.length).fill(0)
  for (let cp = 0; cp < data.ageIdx.length; cp++) {
    const age = data.ageIdx[cp]!
    if (data.isAssigned(cp)) added[age] = (added[age] ?? 0) + 1
  }
  let sum = 0
  const total = added.map((n) => (sum += n))
  const newBlocks: VersionStats["newBlocks"] = data.meta.ages.map(() => [])
  for (const block of data.meta.blocks) {
    const debut = blockDebut(data, block)
    if (debut) newBlocks[debut.version]?.push({ name: block.name, count: debut.count })
  }
  for (const blocks of newBlocks) blocks.sort((a, b) => b.count - a.count)
  return { added, total, newBlocks }
}
