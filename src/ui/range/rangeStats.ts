import { VERSION_YEARS, type UnicodeData } from "../../data/unicode"
import type { CodePoint } from "../../units"

export interface RangeStats {
  assigned: number
  /** Assigned code points per Unicode version, oldest first. */
  byAge: [string, number][]
  /** Assigned code points per script name, most first. */
  byScript: [string, number][]
}

/**
 * What a range holds: how many code points are assigned, and when and in which scripts. `holds`
 * says what counts, if not every assigned code point (for a section from an interpretation).
 */
export const rangeStats = (
  data: UnicodeData,
  s: CodePoint,
  e: CodePoint,
  holds: (cp: CodePoint) => boolean = (cp) => data.isAssigned(cp)
): RangeStats => {
  let assigned = 0
  const byAge = new Map<string, number>()
  const byScript = new Map<string, number>()
  for (let cp = s; cp <= e; cp++) {
    if (!holds(cp)) continue
    assigned++
    const age = data.age(cp)
    byAge.set(age, (byAge.get(age) ?? 0) + 1)
    const script = data.script(cp).name
    byScript.set(script, (byScript.get(script) ?? 0) + 1)
  }
  const year = (v: string): number => VERSION_YEARS[v] ?? 0
  return {
    assigned,
    byAge: [...byAge].sort((a, b) => year(a[0]) - year(b[0]) || parseFloat(a[0]) - parseFloat(b[0])),
    byScript: [...byScript].sort((a, b) => b[1] - a[1])
  }
}
