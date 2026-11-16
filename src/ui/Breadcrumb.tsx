import { planeName, uplus, UnicodeData } from "../data/unicode";
import { cellToCp } from "../map/layout";
import type { Camera } from "../map/MapView";

export function Breadcrumb({
  data,
  camera,
  selected,
  onPlane,
  onBlock,
  onOverview,
}: {
  data: UnicodeData;
  camera: Camera | null;
  selected: number | null;
  onPlane: (p: number) => void;
  onBlock: (i: number) => void;
  onOverview: () => void;
}) {
  // Where are we? The selection if there is one, otherwise the centre of the view (when zoomed in).
  let cp: number | null = selected;
  if (cp === null && camera && camera.k > 2.5) {
    const c = cellToCp(camera.cx, camera.cy);
    cp = c >= 0 ? c : null;
  }
  const plane = cp !== null ? cp >> 16 : null;
  const bi = cp !== null ? data.blockIdx[cp] : -1;
  return (
    <nav className="breadcrumb">
      <button onClick={onOverview}>All planes</button>
      {plane !== null && (
        <>
          <span className="sep">›</span>
          <button onClick={() => onPlane(plane)} title={planeName(plane)[0]}>
            Plane {plane}
            {planeName(plane)[1] && <span className="muted"> {planeName(plane)[1]}</span>}
          </button>
        </>
      )}
      {bi >= 0 && (
        <>
          <span className="sep">›</span>
          <button onClick={() => onBlock(bi)}>
            <span className="crumb-dot" style={{ background: data.meta.regions[data.meta.blocks[bi].region].color }} />
            {data.meta.blocks[bi].name}
          </button>
        </>
      )}
      {selected !== null && (
        <>
          <span className="sep">›</span>
          <span className="crumb-current mono">{uplus(selected)}</span>
        </>
      )}
    </nav>
  );
}
