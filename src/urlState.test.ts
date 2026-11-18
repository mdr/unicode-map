import { describe, expect, test } from "vite-plus/test"
import { ModeId } from "./map/colorModes"
import { RangeKind } from "./data/ranges"
import { formatHash, parseHash } from "./urlState"

describe("parseHash", () => {
  test("reads every part", () => {
    expect(parseHash("U+2603&mode=gc&prop=b:Emoji&asof=6.0&pure&chart=2600&view=1234.5,567.3,40")).toEqual({
      cp: 0x2603,
      mode: ModeId.GENERAL_CATEGORY,
      prop: "b:Emoji",
      asOf: "6.0",
      pure: true,
      chart: 0x2600,
      view: { cx: 1234.5, cy: 567.3, k: 40 }
    })
  })

  test("ignores parts it can't read", () => {
    expect(parseHash("U+110000&mode=nonsense&chart=xyz&view=1,2&view=1,2,0&colour=red&prop=")).toEqual({})
  })

  test("reads a selected plane, block or section", () => {
    expect(parseHash("plane=15")).toEqual({ range: { kind: RangeKind.PLANE, s: 15 } })
    expect(parseHash("block=E000&pua=none")).toEqual({ range: { kind: RangeKind.BLOCK, s: 0xe000 }, pua: "none" })
    expect(parseHash("section=048A")).toEqual({ range: { kind: RangeKind.SECTION, s: 0x48a } })
  })

  test("decodes the hash", () => {
    expect(parseHash("U%2B00E9")).toEqual({ cp: 0xe9 })
  })
})

describe("formatHash", () => {
  test("leaves out the default mode and rounds the view", () => {
    expect(formatHash({ cp: 0x41, mode: ModeId.REGION, view: { cx: 10.04, cy: 2, k: 12.3456 } })).toBe(
      "U+0041&view=10.0,2.0,12.3"
    )
  })

  test("round-trips through parseHash", () => {
    const state = { cp: 0x1f600, mode: ModeId.AGE, asOf: "13.0", chart: 0x1f600, pure: true }
    expect(parseHash(formatHash(state))).toEqual(state)
    const plane = { range: { kind: RangeKind.PLANE, s: 15 }, pua: "none" }
    expect(parseHash(formatHash(plane))).toEqual(plane)
  })
})
