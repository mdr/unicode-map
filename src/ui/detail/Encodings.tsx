import { hex } from "../../data/unicode"
import { Section, Rows, Row } from "./Rows"
import { CopyButton } from "./CopyButton"
import type { CodePoint } from "../../units"

export const Encodings = ({ cp }: { cp: CodePoint }) => {
  const ch = String.fromCodePoint(cp)
  const utf8 = [...new TextEncoder().encode(ch)].map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")
  const utf16 =
    cp > 0xffff
      ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)].map((u) => hex(u)).join(" ")
      : hex(cp)
  const rows: [string, string][] = [
    ["UTF-8", utf8],
    ["UTF-16", utf16],
    ["UTF-32", cp.toString(16).toUpperCase().padStart(8, "0")],
    ["Decimal", String(cp)],
    ["HTML", `&#x${cp.toString(16).toUpperCase()};`],
    ["CSS", `\\${cp.toString(16).toUpperCase()}`],
    ["JavaScript", cp > 0xffff ? `\\u{${cp.toString(16).toUpperCase()}}` : `\\u${hex(cp)}`],
    ["Python", cp > 0xffff ? `\\U${cp.toString(16).toUpperCase().padStart(8, "0")}` : `\\u${hex(cp)}`],
    ["URL", encodeURIComponent(ch)]
  ]
  return (
    <Section title="Encodings">
      <Rows>
        {rows.map(([k, v]) => (
          <Row key={k} label={k}>
            <span className="mono">{v}</span>
            <CopyButton text={v} label={`Copy ${k}`} small />
          </Row>
        ))}
      </Rows>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Bits
