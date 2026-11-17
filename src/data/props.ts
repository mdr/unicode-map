// Property ranges for the highlighter (public/data/props.json, loaded on first use).
import { MAX_CP } from "./unicode"

export interface PropOption {
  /** Stable key used in the URL: "b:<name>" for binary properties, "<prop>:<code>" for values. */
  key: string
  label: string
  group: string
  count: number
  ranges: [number, number][]
}

interface PropsFile {
  binary: { name: string; count: number; ranges: [number, number][] }[]
  enums: {
    prop: string
    label: string
    values: { code: string; name: string; count: number; ranges: [number, number][] }[]
  }[]
}

let loading: Promise<PropOption[]> | undefined = undefined

export const loadProps = (): Promise<PropOption[]> => {
  loading ??= fetch("./data/props.json")
    .then((r) => r.json() as Promise<PropsFile>)
    .then((f) => [
      ...f.binary.map((b) => ({
        key: `b:${b.name}`,
        label: b.name,
        group: "Binary properties",
        count: b.count,
        ranges: b.ranges
      })),
      ...f.enums.flatMap((e) =>
        e.values.map((v) => ({
          key: `${e.prop}:${v.code}`,
          label: v.name === v.code ? v.name : `${v.name} (${v.code})`,
          group: e.label,
          count: v.count,
          ranges: v.ranges
        }))
      )
    ])
  return loading
}

export const maskOf = (opt: PropOption): Uint8Array => {
  const m = new Uint8Array(MAX_CP)
  for (const [a, b] of opt.ranges) m.fill(1, a, b + 1)
  return m
}
