const KEYS: [string, string][] = [
  ["Drag / two-finger scroll", "Pan"],
  ["Pinch / mouse wheel", "Zoom"],
  ["Double-click", "Zoom in (Shift: out)"],
  ["Click", "Select a code point"],
  ["← →", "Previous / next code point"],
  ["Shift + ← →", "Previous / next assigned character"],
  ["↑ ↓", "Up / down a row (256 code points)"],
  ["[  ]", "Previous / next block"],
  ["{  }", "Previous / next plane"],
  ["Enter", "Zoom to the selection"],
  ["+  −  0", "Zoom in, out, show everything"],
  ["1 – 5", "Switch colour mode"],
  ["/", "Search"],
  ["Esc", "Clear selection"],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-backdrop" onClick={onClose}>
      <div className="help panel" onClick={(e) => e.stopPropagation()}>
        <div className="help-title">Getting around</div>
        <dl>
          {KEYS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          The map lays out all 1,114,112 code points: 17 planes of 65,536, each a 256 × 256 grid with 256 code points per row.
        </p>
      </div>
    </div>
  );
}
