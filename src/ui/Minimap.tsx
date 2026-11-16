import { RefObject } from "react";
import type { MapView } from "../map/MapView";

export function Minimap({ view, canvasRef }: { view: RefObject<MapView | null>; canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const nav = (e: React.PointerEvent, animate: boolean) => view.current?.minimapNavigate(e.clientX, e.clientY, animate);
  return (
    <div className="minimap panel" title="Overview — click or drag to move">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          nav(e, true);
        }}
        onPointerMove={(e) => {
          if (e.buttons) nav(e, false);
        }}
      />
    </div>
  );
}
