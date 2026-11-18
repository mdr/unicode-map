import { describe, expect, test } from "vite-plus/test"
import { matchNames, matchTitles, notationCodePoints } from "./search"

describe("notationCodePoints", () => {
  test.each([
    ["U+2603", 0x2603],
    ["u+2603", 0x2603],
    ["0x2603", 0x2603],
    ["\\u2603", 0x2603],
    ["\\u{1F600}", 0x1f600],
    ["&#x2603;", 0x2603],
    ["2603", 0x2603]
  ])("%s", (q, cp) => {
    expect(notationCodePoints(q)).toEqual([{ cp, why: "code point" }])
  })

  test("decimal references", () => {
    expect(notationCodePoints("&#9731;")).toEqual([{ cp: 9731, why: "decimal code point" }])
  })

  test("words aren't notation", () => {
    expect(notationCodePoints("snowman")).toEqual([])
  })
})

describe("matchNames", () => {
  const entries = [
    { cp: 0x2603, text: "snowman" },
    { cp: 0x26c4, text: "snowman without snow" },
    { cp: 0x26c7, text: "black snowman" },
    { cp: 0x1f31e, text: "sun with face" },
    { cp: 0x07, text: "|alert|bel" }
  ]

  test("exact name first, then word starts, shorter names first", () => {
    expect(matchNames(entries, "snowman").map((m) => m.cp)).toEqual([0x2603, 0x26c7, 0x26c4])
  })

  test("every word must appear", () => {
    expect(matchNames(entries, "snow face")).toEqual([])
  })

  test("an alias matches as well as a name", () => {
    expect(matchNames(entries, "alert")).toEqual([{ cp: 0x07, score: 1, length: 99 }])
  })
})

describe("matchTitles", () => {
  const titles = ["Greek and Coptic", "Greek Extended", "Ancient Greek Numbers", "Coptic", "Vowels"]
  const match = (q: string): string[] => matchTitles(titles, (t) => t, q, 6)

  test("every word must appear, in any order", () => {
    expect(match("greek coptic")).toEqual(["Greek and Coptic"])
    expect(match("coptic greek")).toEqual(["Greek and Coptic"])
  })

  test("the title itself first, then titles starting with the query, then shorter ones", () => {
    expect(match("coptic")).toEqual(["Coptic", "Greek and Coptic"])
    expect(match("greek")).toEqual(["Greek Extended", "Greek and Coptic", "Ancient Greek Numbers"])
  })

  test("words can also come from the context", () => {
    const sections = [
      ["Vowels", "Thai"],
      ["Vowels", "Lao"]
    ]
    const found = matchTitles(
      sections,
      ([t = ""]) => t,
      "lao vowels",
      6,
      ([, block = ""]) => block
    )
    expect(found).toEqual([["Vowels", "Lao"]])
  })

  test("whole words before parts of words", () => {
    expect(matchTitles(["Independent vowels", "Dependent vowel signs"], (t) => t, "dependent vowel", 6)).toEqual([
      "Dependent vowel signs",
      "Independent vowels"
    ])
  })

  test("at most the limit", () => {
    expect(matchTitles(titles, (t) => t, "e", 2)).toHaveLength(2)
  })
})
