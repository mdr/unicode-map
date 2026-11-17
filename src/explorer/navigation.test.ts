import { describe, expect, test } from "vite-plus/test"
import type { Block } from "../data/unicode"
import { neighbourBlock, stepCodePoint } from "./navigation"

describe("stepCodePoint", () => {
  const evens = (cp: number): boolean => cp % 2 === 0

  test("steps by delta", () => {
    expect(stepCodePoint(0x100, 256, false, evens)).toBe(0x200)
  })

  test("skips unassigned code points when asked", () => {
    expect(stepCodePoint(10, 1, true, evens)).toBe(12)
    expect(stepCodePoint(10, 1, false, evens)).toBe(11)
  })

  test("stays within the code space", () => {
    expect(stepCodePoint(5, -256, false, evens)).toBe(0)
    expect(stepCodePoint(0x10fff0, 256, false, evens)).toBe(0x10ffff)
  })
})

describe("neighbourBlock", () => {
  const blocks = [
    { s: 0x0000, e: 0x007f },
    { s: 0x0080, e: 0x00ff },
    { s: 0x0370, e: 0x03ff }
  ] as Block[]

  test("finds the next block starting after a code point, or the last ending before it", () => {
    expect(neighbourBlock(blocks, 0x41, 1)).toBe(1)
    expect(neighbourBlock(blocks, 0x200, 1)).toBe(2)
    expect(neighbourBlock(blocks, 0x200, -1)).toBe(1)
    expect(neighbourBlock(blocks, 0x41, -1)).toBe(-1)
    expect(neighbourBlock(blocks, 0x380, 1)).toBe(-1)
  })
})
