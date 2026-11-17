import { useEffect, useMemo, useRef, useState } from "react"
import { search, type SearchResult, SearchResultType } from "../data/search"
import { uplus, type UnicodeData } from "../data/unicode"
import { Glyph } from "./Glyph"
import type { CodePoint, BlockIndex } from "../units"
import styles from "./SearchBox.module.css"

export const SearchBox = ({
  data,
  onPickCp,
  onPickBlock
}: {
  data: UnicodeData
  onPickCp: (cp: CodePoint) => void
  onPickBlock: (index: BlockIndex) => void
}) => {
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
    if (r.type === SearchResultType.CODE_POINT) onPickCp(r.cp)
    else onPickBlock(r.index)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className={styles.search}>
      <svg
        className={styles.searchIcon}
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
      <kbd className={styles.searchKbd}>/</kbd>
      {open && q.trim() && (
        <div className="search-results" role="listbox" ref={listRef}>
          {results.length === 0 && <div className={styles.searchEmpty}>No matches</div>}
          {results.map((r, i) => (
            <div
              key={r.type === SearchResultType.CODE_POINT ? `c${r.cp}` : `b${r.index}`}
              className={`${styles.searchResult} ${i === active ? "active" : ""}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(r)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {r.type === SearchResultType.CODE_POINT ? (
                <>
                  <span className={styles.srGlyph}>
                    <Glyph data={data} cp={r.cp} />
                  </span>
                  <span className={styles.srMain}>
                    <span className={styles.srName}>{data.name(r.cp)}</span>
                    <span className={styles.srSub}>
                      {uplus(r.cp)} · {data.block(r.cp)?.name ?? "No block"}
                      {r.why ? ` · ${r.why}` : ""}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={`${styles.srGlyph} ${styles.srBlock}`}
                    style={{ background: data.regionOf(r.block).color }}
                  >
                    ▦
                  </span>
                  <span className={styles.srMain}>
                    <span className={styles.srName}>{r.block.name}</span>
                    <span className={styles.srSub}>
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
