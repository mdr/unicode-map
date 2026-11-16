import { useEffect, useMemo, useRef, useState } from "react";
import { loadProps, PropOption } from "../data/props";

/** "Highlight characters with a property": a button that opens a searchable list of properties. */
export function PropertyFilter({ value, onChange }: { value: PropOption | null; onChange: (p: PropOption | null) => void }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PropOption[] | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !options) loadProps().then(setOptions);
  }, [open, options]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    if (!options) return [];
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((o) => {
      const text = `${o.label} ${o.group} ${o.key}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }, [options, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector(".pf-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (o: PropOption) => {
    onChange(o);
    setOpen(false);
    setQ("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((a) => Math.min(filtered.length - 1, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Enter" && filtered[active]) pick(filtered[active]);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  let lastGroup = "";
  return (
    <div className="pf" ref={root}>
      <div className={`pf-button ${value ? "on" : ""}`}>
        <button className="pf-open" onClick={() => setOpen((o) => !o)} title="Highlight characters with a property (p)">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path d="M2 3h12l-4.6 5.4V13l-2.8 1.2V8.4z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          {value ? (
            <span className="pf-value">
              {value.group !== "Binary properties" && <span className="pf-group">{value.group}:</span>}
              {value.label}
              <span className="pf-count">{value.count.toLocaleString()}</span>
            </span>
          ) : (
            <span>Highlight</span>
          )}
        </button>
        {value && (
          <button className="pf-clear" title="Clear highlight" onClick={() => onChange(null)}>
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="pf-pop panel">
          <input
            autoFocus
            id="property-input"
            className="pf-input"
            placeholder="Emoji, Math, Dash, Right To Left, Wide…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          <div className="pf-list" ref={list}>
            {!options && <div className="pf-empty">Loading…</div>}
            {options && !filtered.length && <div className="pf-empty">No matching properties</div>}
            {filtered.map((o, i) => {
              const head = o.group !== lastGroup ? (lastGroup = o.group) : null;
              return (
                <div key={o.key}>
                  {head && <div className="pf-head">{head}</div>}
                  <button
                    className={`pf-item ${i === active ? "active" : ""} ${value?.key === o.key ? "current" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                  >
                    <span className="pf-label">{o.label}</span>
                    <span className="pf-count">{o.count.toLocaleString()}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
