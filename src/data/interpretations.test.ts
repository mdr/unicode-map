import { describe, expect, test } from "vite-plus/test"
import { interpretationFromUrl, interpretationToUrl, nextInterpretation } from "./interpretations"

describe("interpretations in the URL", () => {
  test("ConScript unless the URL says none", () => {
    expect(interpretationFromUrl(undefined)).toBe("conscript")
    expect(interpretationFromUrl("none")).toBeUndefined()
  })

  test("only a change from the default is written", () => {
    expect(interpretationToUrl("conscript")).toBeUndefined()
    expect(interpretationToUrl(undefined)).toBe("none")
  })

  test("cycling goes through none and back round", () => {
    expect(nextInterpretation(undefined)).toBe("conscript")
    expect(nextInterpretation("conscript")).toBeUndefined()
  })
})
