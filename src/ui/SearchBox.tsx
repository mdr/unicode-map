import { useEffect, useMemo, useRef, useState } from "react"
import { search, type SearchResult } from "../data/search"
import { uplus, type UnicodeData } from "../data/unicode"
import { Glyph } from "./Glyph"

export function SearchBox({
  data,
  onPickCp,
  onPickBlock
}: {
  data: UnicodeData
  onPickCp: (cp: number) => void
  onPickBlock: (index: number) => void
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [debounced, setDebounced] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 60)
    return () => clearTimeout(t)
  }, [q])
  const results = useMemo(() => search(data, debounced), [data, debounced])
  useEffect(() => setActive(0), [results])
  useEffect(() => {
    listRef.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" })
  }, [active])

  const pick = (r: SearchResult) => {
    if (r.kind === "cp") onPickCp(r.cp)
    else onPickBlock(r.index)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="search">
      <svg
        className="search-icon"
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="7" cy="7" r="5" />
        <path d="M11 11l3.5 3.5" />
      </svg>
      <input
        id="search-input"
        ref={inputRef}
        value={q}
        placeholder="Search names, U+2603, or a character…"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            setActive((a) => Math.min(results.length - 1, a + 1))
            e.preventDefault()
          } else if (e.key === "ArrowUp") {
            setActive((a) => Math.max(0, a - 1))
            e.preventDefault()
          } else if (e.key === "Enter" && results[active]) {
            pick(results[active])
          } else if (e.key === "Escape") {
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
      />
      <kbd className="search-kbd">/</kbd>
      {open && q.trim() && (
        <div className="search-results" role="listbox" ref={listRef}>
          {results.length === 0 && <div className="search-empty">No matches</div>}
          {results.map((r, i) => (
            <div
              key={r.kind === "cp" ? `c${r.cp}` : `b${r.index}`}
              className={`search-result ${i === active ? "active" : ""}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(r)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {r.kind === "cp" ? (
                <>
                  <span className="sr-glyph">
                    <Glyph data={data} cp={r.cp} />
                  </span>
                  <span className="sr-main">
                    <span className="sr-name">{data.name(r.cp)}</span>
                    <span className="sr-sub">
                      {uplus(r.cp)} · {data.block(r.cp)?.name ?? "No block"}
                      {r.why ? ` · ${r.why}` : ""}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="sr-glyph sr-block" style={{ background: data.meta.regions[r.block.region].color }}>
                    ▦
                  </span>
                  <span className="sr-main">
                    <span className="sr-name">{r.block.name}</span>
                    <span className="sr-sub">
                      Block · {uplus(r.block.s)}–{uplus(r.block.e)} · {r.block.assigned.toLocaleString()} assigned
                    </span>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
