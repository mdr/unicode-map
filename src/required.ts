/**
 * A value the data guarantees is there, such as an index into a table built alongside it.
 * Throws, naming what was missing, rather than carrying on with undefined.
 */
export const required = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`Missing ${what}`)
  return value
}
