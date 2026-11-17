import { describe, expect, test } from "vite-plus/test"
import { cellToCp, cpToCell, rangeRect } from "./layout"

describe("cpToCell and cellToCp", () => {
  test("round-trip code points in every plane", () => {
    for (const cp of [0, 0x41, 0xffff, 0x10000, 0x1f600, 0xe0001, 0x10ffff]) {
      const { x, y } = cpToCell(cp)
      expect(cellToCp(x + 0.5, y + 0.5)).toBe(cp)
    }
  })

  test("a row holds 256 code points", () => {
    expect(cpToCell(0x0100)).toEqual({ x: 0, y: 1 })
    expect(cpToCell(0x01ff)).toEqual({ x: 255, y: 1 })
  })

  test("the gaps between planes and the empty grid slots hold no code point", () => {
    expect(cellToCp(-1, 0)).toBe(-1)
    expect(cellToCp(256.5, 0)).toBe(-1)
    expect(cellToCp(5 * 296 + 10, 2 * 296 + 10)).toBe(-1)
  })
})

describe("rangeRect", () => {
  test("a range within one row is as wide as the range", () => {
    expect(rangeRect(0x41, 0x5a)).toEqual({ x: 0x41, y: 0, w: 26, h: 1 })
    expect(rangeRect(0x0370, 0x03ff)).toEqual({ x: 0x70, y: 3, w: 144, h: 1 })
  })

  test("a range over several rows spans the plane's width", () => {
    expect(rangeRect(0x0400, 0x052f)).toEqual({ x: 0, y: 4, w: 256, h: 2 })
  })
})
