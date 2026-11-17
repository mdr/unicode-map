import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Detail, displayString, hex, MAX_CP, planeName, uplus, UnicodeData, VERSION_YEARS } from "../data/unicode";
import { ColorMode, cpColor } from "../map/colorModes";
import { Glyph } from "./Glyph";
import { AboutCards, blockScript } from "./About";
import type { Here } from "../map/MapView";

interface Props {
  data: UnicodeData;
  mode: ColorMode;
  cp: number | null;
  here: Here | null;
  onSelect: (cp: number) => void;
  onBlock: (i: number) => void;
  onPlane: (p: number) => void;
  onClose: () => void;
  /** Point a range out on the map while hovering it (null to stop). */
  onPreview: (r: { s: number; e: number; name: string } | null) => void;
  /** Fly to a code point range (a chart section). */
  onRange: (s: number, e: number) => void;
  /** Open a block as a code chart. */
  onChart: (block: number) => void;
  /** The block whose chart is open, if any. */
  chartBlock: number | null;
}

export function DetailPanel(props: Props) {
  return (
    <aside className="detail">
      {props.cp === null ? <Overview {...props} /> : <CodePointDetail {...props} cp={props.cp} />}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Nothing selected: overview of the code space and the plane in view

function Overview({ data, here, onPlane, onBlock, onPreview, onRange, onChart, chartBlock }: Props) {
  const planeStats = useMemo(
    () =>
      Array.from({ length: 17 }, (_, p) => {
        let assigned = 0;
        for (let cp = p << 16; cp < (p + 1) << 16; cp++) if (data.isAssigned(cp)) assigned++;
        return assigned;
      }),
    [data],
  );
  const total = planeStats.reduce((a, b) => a + b, 0);
  // Don't leave the map dimmed if this panel goes away under the pointer (e.g. on selecting).
  useEffect(() => () => onPreview(null), [onPreview]);
  const plane = here && here.cp >= 0 && here.k > 1.6 ? here.cp >> 16 : null;
  const currentBlock = plane !== null && here!.k > 2.5 ? data.blockIdx[here!.cp] : -1;
  /** The block whose "About" is open in the list. */
  const [aboutOpen, setAboutOpen] = useState<number | null>(null);
  const currentSection = currentBlock >= 0 && here!.k > 10 ? data.sectionRange(here!.cp) : undefined;
  // Keep the block you're in visible in the list as you move between blocks.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector(".block-row.current")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [currentBlock]);
  /** Chart sections per block, for the current block's row to expand into. */
  const sectionsByBlock = useMemo(() => {
    const m = new Map<number, [number, number, string][]>();
    for (const sec of data.meta.sections) {
      const b = data.blockIdx[sec[0]];
      if (b < 0) continue;
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(sec);
    }
    return m;
  }, [data]);
  return (
    <div className="detail-scroll">
      {plane === null && (
      <div className="ov-hero">
        <div className="ov-title">The Unicode code space</div>
        <p className="muted">
          {MAX_CP.toLocaleString()} code points in 17 planes. Unicode {data.meta.version} assigns{" "}
          <b>{total.toLocaleString()}</b> of them across <b>{data.meta.blocks.length}</b> blocks and{" "}
          <b>{data.meta.scripts.length - 3}</b> scripts.
        </p>
        <p className="muted small">Click any cell to inspect it, or search above. Press <kbd>?</kbd> for shortcuts.</p>
      </div>
      )}
      <Section title="Planes">
        {plane !== null ? (
          // Inside a plane, the planes shrink to a row of numbered tiles, leaving room for its blocks.
          <div className="plane-grid">
            {planeStats.map((n, p) => (
              <button
                key={p}
                className={`plane-tile ${plane === p ? "current" : ""} ${n ? "" : "empty"}`}
                title={`Plane ${p}: ${planeName(p)[0]} · ${n ? `${n.toLocaleString()} assigned` : "nothing assigned"}`}
                onClick={() => {
                  onPreview(null);
                  onPlane(p);
                }}
                onMouseEnter={() => onPreview({ s: p << 16, e: (p << 16) | 0xffff, name: `Plane ${p} · ${planeName(p)[0]}` })}
                onMouseLeave={() => onPreview(null)}
              >
                {p}
                <span className="plane-tile-fill" style={{ width: `${(n / 65536) * 100}%` }} />
              </button>
            ))}
          </div>
        ) : (
        <div className="plane-list">
          {planeStats.map((n, p) => (
            <button
              key={p}
              className={`plane-row ${plane === p ? "current" : ""}`}
              onClick={() => {
                onPreview(null);
                onPlane(p);
              }}
              onMouseEnter={() => onPreview({ s: p << 16, e: (p << 16) | 0xffff, name: `Plane ${p} · ${planeName(p)[0]}` })}
              onMouseLeave={() => onPreview(null)}
            >
              <span className="plane-num">{p}</span>
              <span className="plane-name">
                {planeName(p)[0]}
                <span className="muted small mono"> {hex(p << 16)}–{hex((p << 16) | 0xffff)}</span>
              </span>
              <span className="plane-bar">
                <span style={{ width: `${(n / 65536) * 100}%` }} />
              </span>
              <span className="plane-count">{n ? n.toLocaleString() : "—"}</span>
            </button>
          ))}
        </div>
        )}
      </Section>
      {plane !== null && (
        <Section title={`Blocks in plane ${plane} · ${planeName(plane)[0]}`}>
          <div className="block-list" ref={listRef}>
            {data.meta.blocks.map((b, i) =>
              b.s >> 16 === plane ? (
                <div key={i} className={`block-item ${aboutOpen === i ? "open" : ""}`}>
                <button
                  className={`block-row ${currentBlock === i ? "current" : ""}`}
                  onClick={() => {
                    onPreview(null);
                    onBlock(i);
                  }}
                  onMouseEnter={() => onPreview({ s: b.s, e: b.e, name: b.name })}
                  onMouseLeave={() => onPreview(null)}
                >
                  <span className="swatch" style={{ background: data.meta.regions[b.region].color }} />
                  <span className="block-name">{b.name}</span>
                  <span className="muted small mono">{hex(b.s)}</span>
                </button>
                <button
                  className={`info-btn chart-btn ${chartBlock === i ? "on" : ""}`}
                  title={`Open ${b.name} as a code chart (c)`}
                  onClick={() => onChart(i)}
                >
                  <ChartIcon />
                </button>
                <button
                  className="info-btn"
                  title={`About ${b.name}`}
                  aria-expanded={aboutOpen === i}
                  onClick={() => setAboutOpen(aboutOpen === i ? null : i)}
                >
                  i
                </button>
                </div>
              ) : null,
            ).flatMap((row, i) => {
              if (!row) return [];
              const about =
                aboutOpen === i ? (
                  <div key={`a${i}`} className="block-about">
                    <AboutCards data={data} script={blockScript(data, i)} block={i} />
                  </div>
                ) : null;
              // The block you're in opens up into its chart sections.
              const secs = i === currentBlock ? sectionsByBlock.get(i) : undefined;
              if (!secs) return about ? [row, about] : [row];
              return [
                row,
                ...(about ? [about] : []),
                <div key={`s${i}`} className="section-list" style={{ borderColor: data.meta.regions[data.meta.blocks[i].region].color }}>
                  {secs.map(([a, e, title]) => (
                    <button
                      key={a}
                      className={`section-row ${currentSection?.[0] === a ? "current" : ""}`}
                      title={title}
                      onClick={() => {
                        onPreview(null);
                        onRange(a, e);
                      }}
                      onMouseEnter={() => onPreview({ s: a, e, name: title })}
                      onMouseLeave={() => onPreview(null)}
                    >
                      <span className="block-name">{title}</span>
                      <span className="muted small mono">{hex(a)}</span>
                    </button>
                  ))}
                </div>,
              ];
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single code point

function CodePointDetail({ data, mode, cp, onSelect, onBlock, onPlane, onClose, onChart }: Props & { cp: number }) {
  const [detail, setDetail] = useState<Detail | undefined | null>(null);
  useEffect(() => {
    let live = true;
    setDetail(null);
    data.detail(cp).then((d) => live && setDetail(d));
    return () => {
      live = false;
    };
  }, [data, cp]);

  const assigned = data.isAssigned(cp);
  const gc = data.gc(cp);
  const script = data.script(cp);
  const age = data.age(cp);
  const block = data.block(cp);
  const blockIndex = data.blockIdx[cp];
  const region = data.region(cp);
  const plane = cp >> 16;
  const vn = data.meta.valueNames;
  const d = detail ?? {};
  const font = d.font !== undefined ? data.meta.fonts[d.font] : undefined;

  return (
    <div className="detail-scroll" key={cp}>
      <div className="cp-hero" style={{ ["--accent" as string]: cpColor(mode, cp) }}>
        <button className="close" onClick={onClose} title="Close (Esc)">×</button>
        <div className="cp-glyph">{assigned && <Glyph data={data} cp={cp} />}</div>
        <div className="cp-id">
          <span className="mono cp-uplus">{uplus(cp)}</span>
          <CopyButton text={String.fromCodePoint(cp)} label="Copy character" disabled={gc.code === "Cs"} />
        </div>
        <h1 className="cp-name">{data.name(cp)}</h1>
        {d.section && <div className="cp-section">{d.section}</div>}
        <div className="cp-nav">
          <button onClick={() => cp > 0 && onSelect(cp - 1)} title="Previous (←)">‹ {hex(Math.max(0, cp - 1))}</button>
          <button onClick={() => cp < MAX_CP - 1 && onSelect(cp + 1)} title="Next (→)">{hex(Math.min(MAX_CP - 1, cp + 1))} ›</button>
        </div>
        <div className="cp-links">
          <a
            href={`https://util.unicode.org/UnicodeJsps/character.jsp?a=${hex(cp)}`}
            target="_blank"
            rel="noreferrer"
            title="This character's properties, on the Unicode Consortium's site"
          >
            unicode.org ↗
          </a>
          {block && (
            <a href={`https://www.unicode.org/charts/PDF/U${hex(block.s)}.pdf`} target="_blank" rel="noreferrer" title={`The official code chart for ${block.name} (PDF)`}>
              Code chart ↗
            </a>
          )}
          {d.unihan && (
            <a
              href={`https://www.unicode.org/cgi-bin/GetUnihanData.pl?codepoint=${hex(cp)}`}
              target="_blank"
              rel="noreferrer"
              title="This ideograph in the Unihan database"
            >
              Unihan ↗
            </a>
          )}
        </div>
      </div>

      {!assigned && <Unassigned data={data} cp={cp} />}

      <Section title="Where it lives">
        <Rows>
          <Row label="Plane">
            <button className="link" onClick={() => onPlane(plane)}>
              {plane} · {planeName(plane)[0]}
            </button>
          </Row>
          {block && (
            <Row label="Block">
              <button className="link" onClick={() => onBlock(blockIndex)}>{block.name}</button>
              <span className="muted small mono"> {hex(block.s)}–{hex(block.e)}</span>{" "}
              <button className="link small" title="Open the block as a code chart (c)" onClick={() => onChart(blockIndex)}>
                Chart
              </button>
            </Row>
          )}
          {region && (
            <Row label="Region">
              <span className="swatch inline" style={{ background: region.color }} /> {region.name}
            </Row>
          )}
          {assigned && <Row label="Category">{gc.name} <span className="muted mono">({gc.code})</span></Row>}
          {assigned && (
            <Row label="Script">
              {script.name}
              {d.scx && d.scx.length > 0 && (
                <span className="muted small"> · also used in {d.scx.map((s) => data.meta.scripts.find((x) => x.code === s)?.name ?? s).join(", ")}</span>
              )}
            </Row>
          )}
          {age && (
            <Row label="Added in">
              Unicode {age}
              {VERSION_YEARS[age] && <span className="muted"> ({VERSION_YEARS[age]})</span>}
            </Row>
          )}
        </Rows>
      </Section>

      {(assigned || block) && (
        <Section title="About">
          <AboutCards data={data} script={assigned ? script.code : block ? blockScript(data, blockIndex) : undefined} block={blockIndex} />
        </Section>
      )}

      {(d.aliases || d.alsoKnownAs || d.formalAlias || d.notes || d.variations) && (
        <Section title="Names & notes">
          {d.aliases && (
            <Rows>
              {d.aliases.map(([a, t]) => (
                <Row key={a} label={aliasLabel(t)}>{a}</Row>
              ))}
            </Rows>
          )}
          {d.formalAlias && <Rows>{d.formalAlias.map((a) => <Row key={a} label="Formal alias">{a}</Row>)}</Rows>}
          {d.alsoKnownAs && (
            <div className="chips text">
              {d.alsoKnownAs.map((a) => (
                <span key={a} className="chip">{a}</span>
              ))}
            </div>
          )}
          {d.notes && (
            <ul className="notes">
              {d.notes.map((n) => (
                <li key={n}><Linkified text={n} data={data} onSelect={onSelect} /></li>
              ))}
            </ul>
          )}
          {d.variations && (
            <ul className="notes">
              {d.variations.map((n) => (
                <li key={n}><Linkified text={n} data={data} onSelect={onSelect} /></li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {d.unihan && <Unihan data={data} u={d.unihan} onSelect={onSelect} />}

      {(d.seeAlso || d.confusables || d.confusableWith || d.decomp || d.upper !== undefined || d.lower !== undefined || d.title !== undefined) && (
        <Section title="Related characters">
          {d.decomp && (
            <Related label={`Decomposes to${d.decomp.type !== "canonical" ? ` (${d.decomp.type})` : ""}`} cps={d.decomp.cps} data={data} onSelect={onSelect} />
          )}
          {(d.upper !== undefined || d.lower !== undefined || d.title !== undefined) && (
            <Related
              label="Case"
              cps={[d.upper, d.lower, d.title].filter((c): c is number => c !== undefined && c !== cp).filter((c, i, a) => a.indexOf(c) === i)}
              data={data}
              onSelect={onSelect}
            />
          )}
          {d.seeAlso && <Related label="See also" cps={d.seeAlso} data={data} onSelect={onSelect} />}
          {d.confusableWith && <Related label="Can be confused with" cps={d.confusableWith} data={data} onSelect={onSelect} />}
          {d.confusables && <Related label="Lookalikes" cps={d.confusables} data={data} onSelect={onSelect} />}
        </Section>
      )}

      {gc.code !== "Cs" && <Encodings cp={cp} />}

      {assigned && (
        <Section title="Properties">
          <Rows>
            {d.bidi && <Row label="Bidi class">{vn.bc[d.bidi] ?? d.bidi} <span className="muted mono">({d.bidi})</span></Row>}
            {d.ccc !== undefined && <Row label="Combining class">{d.ccc} <span className="muted">{vn.ccc[String(d.ccc)] ?? ""}</span></Row>}
            {d.eaw && <Row label="East Asian width">{vn.ea[d.eaw] ?? d.eaw}</Row>}
            {d.lb && <Row label="Line break">{vn.lb[d.lb] ?? d.lb} <span className="muted mono">({d.lb})</span></Row>}
            {d.num && <Row label="Numeric value">{d.num}</Row>}
            {d.mirrored && <Row label="Bidi mirrored">Yes</Row>}
            <Row label="Rendered with">
              {font ? font.family : detail === null ? "…" : <span className="muted">No Noto glyph — Last Resort placeholder</span>}
            </Row>
          </Rows>
          {d.props && (
            <div className="chips text">
              {d.props.map((i) => (
                <span key={i} className="chip prop">{data.meta.binaryProps[i].replace(/_/g, " ")}</span>
              ))}
            </div>
          )}
        </Section>
      )}

    </div>
  );
}

function Unassigned({ data, cp }: { data: UnicodeData; cp: number }) {
  const nonchar = data.nonchar[cp];
  const block = data.block(cp);
  return (
    <div className="callout">
      {nonchar ? (
        <>
          <b>Noncharacter.</b> Permanently reserved for internal use by applications; it will never be assigned a character.
        </>
      ) : block ? (
        <>
          <b>Reserved.</b> This code point sits inside the <i>{block.name}</i> block but has no character assigned yet.
        </>
      ) : (
        <>
          <b>Unallocated.</b> No block has been allocated here yet. It is available for future versions of Unicode.
        </>
      )}
    </div>
  );
}

function Unihan({ data, u, onSelect }: { data: UnicodeData; u: NonNullable<Detail["unihan"]>; onSelect: (cp: number) => void }) {
  const readings: [string, string | undefined][] = [
    ["Mandarin", u.mandarin],
    ["Cantonese", u.cantonese],
    ["Japanese", u.japanese ?? [u.jaOn, u.jaKun].filter(Boolean).join(" · ")],
    ["Korean", u.hangul ? `${u.hangul.replace(/:\S+/g, "")}${u.korean ? ` (${u.korean.toLowerCase()})` : ""}` : u.korean?.toLowerCase()],
    ["Vietnamese", u.vietnamese],
  ];
  return (
    <Section title="CJK ideograph (Unihan)">
      {u.def && <p className="unihan-def">“{u.def}”</p>}
      <Rows>
        {readings.filter(([, v]) => v).map(([k, v]) => (
          <Row key={k} label={k}>{v}</Row>
        ))}
        {u.radical && (
          <Row label="Radical">
            {u.radical.char && (
              <button className="link" onClick={() => onSelect(u.radical!.char!.codePointAt(0)!)}>
                <Glyph data={data} cp={u.radical.char.codePointAt(0)!} />
              </button>
            )}{" "}
            #{u.radical.num} + {u.radical.extra} strokes
          </Row>
        )}
        {u.strokes !== undefined && <Row label="Total strokes">{u.strokes}</Row>}
        {u.grade && <Row label="Grade level">{u.grade}</Row>}
      </Rows>
      {u.simplified && <Related label="Simplified form" cps={u.simplified} data={data} onSelect={onSelect} />}
      {u.traditional && <Related label="Traditional form" cps={u.traditional} data={data} onSelect={onSelect} />}
      {u.semantic && <Related label="Semantic variants" cps={u.semantic} data={data} onSelect={onSelect} />}
      {u.zvariant && <Related label="Z-variants" cps={u.zvariant} data={data} onSelect={onSelect} />}
    </Section>
  );
}

function Encodings({ cp }: { cp: number }) {
  const ch = String.fromCodePoint(cp);
  const utf8 = [...new TextEncoder().encode(ch)].map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  const utf16 = cp > 0xffff
    ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)].map((u) => hex(u)).join(" ")
    : hex(cp);
  const rows: [string, string][] = [
    ["UTF-8", utf8],
    ["UTF-16", utf16],
    ["UTF-32", cp.toString(16).toUpperCase().padStart(8, "0")],
    ["Decimal", String(cp)],
    ["HTML", `&#x${cp.toString(16).toUpperCase()};`],
    ["CSS", `\\${cp.toString(16).toUpperCase()}`],
    ["JavaScript", cp > 0xffff ? `\\u{${cp.toString(16).toUpperCase()}}` : `\\u${hex(cp)}`],
    ["Python", cp > 0xffff ? `\\U${cp.toString(16).toUpperCase().padStart(8, "0")}` : `\\u${hex(cp)}`],
    ["URL", encodeURIComponent(ch)],
  ];
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
  );
}

// ---------------------------------------------------------------------------
// Bits

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Rows({ children }: { children: ReactNode }) {
  return <dl className="rows">{children}</dl>;
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Related({ label, cps, data, onSelect }: { label: string; cps: number[]; data: UnicodeData; onSelect: (cp: number) => void }) {
  if (!cps.length) return null;
  return (
    <div className="related">
      <div className="related-label">{label}</div>
      <div className="chips">
        {cps.map((c, i) => (
          <CharChip key={`${c}-${i}`} cp={c} data={data} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function CharChip({ cp, data, onSelect }: { cp: number; data: UnicodeData; onSelect: (cp: number) => void }) {
  return (
    <button className="char-chip" onClick={() => onSelect(cp)} title={`${uplus(cp)} ${data.name(cp)}`}>
      <Glyph data={data} cp={cp} className="cc-glyph" />
      <span className="cc-text">
        <span className="mono">{uplus(cp)}</span>
        <span className="cc-name">{data.name(cp)}</span>
      </span>
    </button>
  );
}

/** Turn code point references like "2026" or "(name - 2026)" inside NamesList notes into links. */
function Linkified({ text, data, onSelect }: { text: string; data: UnicodeData; onSelect: (cp: number) => void }) {
  const parts = text.split(/\b([0-9A-F]{4,6})\b/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 && parseInt(p, 16) < MAX_CP ? (
          <button key={i} className="link mono" onClick={() => onSelect(parseInt(p, 16))} title={data.name(parseInt(p, 16))}>
            {p}
            {displayString(data, parseInt(p, 16)) && <> <Glyph data={data} cp={parseInt(p, 16)} /></>}
          </button>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function CopyButton({ text, label, small, disabled }: { text: string; label: string; small?: boolean; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`copy ${small ? "small" : ""}`}
      title={label}
      disabled={disabled}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1000);
        });
      }}
    >
      {done ? "✓" : "⧉"}
    </button>
  );
}

function aliasLabel(t: string) {
  return { correction: "Corrected name", control: "Control name", alternate: "Alternate name", figment: "Figment", abbreviation: "Abbreviation" }[t] ?? t;
}

/** A small grid: open as a code chart. */
function ChartIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
      {[0, 4, 8].flatMap((x) => [0, 4, 8].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="3" height="3" rx="0.6" fill="currentColor" />))}
    </svg>
  );
}
