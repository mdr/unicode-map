# Unicode Map

An interactive, zoomable map of the whole Unicode code space: all 1,114,112 code points,
from the 17 planes down to individual characters.

## Running it

Everything comes from the Nix flake: Node, pnpm, Python with fontTools, the Unicode data
files and the fonts.

```sh
nix develop          # or `direnv allow` (there's an .envrc)
pnpm install         # once
pnpm data            # compile the UCD into public/data and link the fonts (~30s)
pnpm tiles           # optional: pre-build pure view's glyph tiles into public/tiles (~1 min)
pnpm dev             # http://localhost:5173
```

Re-run `pnpm data` after changing `scripts/build_data.py` or bumping the Unicode version,
and `pnpm tiles` after that or after changing the fonts. `pnpm tiles` draws the tiles with the
app itself in headless Google Chrome (set `CHROME` to use another binary). Without the tiles,
pure view draws them in the browser instead, which is slower to fill in.

## How it fits together

- **`flake.nix`** pins the Unicode version (`unicodeVersion`) and fetches `UCD.zip`,
  `Unihan.zip` and `confusables.txt` with fixed hashes. The `fonts` package assembles a
  font set that browsers can load: one regular face per Noto family, single faces extracted
  from the CJK collections, and Noto Color Emoji. Gap fillers come after Noto:
  - Jigmo, for the CJK extensions.
  - Kreative Square, for Legacy Computing.
  - Kaiyuan Small Seal, for Seal. It isn't released yet, so it's built from its glyph
    sources at a pinned commit.
  - UniHieroglyphica, for Egyptian Hieroglyphs Extended-A. It isn't in nixpkgs, so it's
    fetched from its GitHub repository at a pinned commit.
  - Unifont, a pixel font, for the few things nothing else covers.

  Last Resort is the final placeholder. Inter and JetBrains Mono are the interface fonts,
  with Noto Sans as a fallback for interface text Inter can't draw.
  The package also writes a `manifest.json` recording each font's coverage. The dev shell exports the paths as `UCD_DIR`, `UNIHAN_DIR`, `CONFUSABLES` and
  `FONTS_DIR`.
- **`scripts/build_data.py`** (stdlib, plus fontTools for one step) turns those into:
  - `meta.json`: blocks, code chart sections, regions, property values, and run-length
    maps of General Category, Script, Age and font per code point.
  - `props.json`: code point ranges for every binary property and a few enumerated ones
    (bidi class, width, line break, decomposition, numeric and joining type). The property
    highlighter loads it on first use.
  - `names.txt`: names and aliases, used for search.
  - `detail/NN.json`: per-character detail in 4,096-code-point chunks, loaded on demand.
  - `fonts.css`: an `@font-face` per font.
  - `LastResort.ttf`: a copy of Last Resort with a cmap every browser reads. The original
    maps supplementary planes only through a format 13 subtable, which Firefox ignores, so
    Firefox drew its own hex boxes instead.
  - `coverage.json`: assigned characters that no Noto font covers.
- **`src/map/MapView.ts`** is the canvas renderer. Each plane is a 256×256 bitmap, scaled
  up, at low zoom. Grid lines fade in as you zoom, then cards with glyphs, code points and
  names. Cards keep their cell's colour at every zoom, with dark or light text to suit it.
  Block outlines and labels sit on top, with sticky row and column axes. From mid zoom,
  blocks split into their code chart sections (the `@` subheadings in `NamesList.txt`): block
  and section headers sit on the row edges where each starts and stay on screen while you pan.
  They're placed in priority order and skipped if they would overlap, so busy areas thin out.
  The renderer also dims everything outside a highlight (rare matches get rings when zoomed
  out) and hides characters newer than the timeline's version. Pure view (`z`) drops the
  colours, labels and interface. In it, glyphs show from mid zoom using a pyramid of tile
  images at 2, 6, 12 and 24 px per code point, with 128, 64, 32 and 16 code points per tile
  side. The 2 px level is drawn at 6 px and averaged down, so even zoomed right out each
  area shows its texture: dense ideographs bright, marks faint, emoji in colour.
  These are pre-built WebP files (about 35 MB) fetched as they come into view; without them,
  or for the 48 px level used on Retina screens, tiles are drawn in the browser. Live font
  rendering takes over once the cards appear.
  The normal view uses the same tiles for glyph texture when zoomed out (`g` toggles it):
  they're recoloured with each cell's ink, dark or light to suit its colour as on the cards,
  from a per-plane ink bitmap that also fades dimmed characters and hides ones newer than the
  timeline's version.
- **`scripts/build_tiles.mjs`** pre-builds those tiles.
- **`src/map/colorModes.ts`** defines the colour modes: region, general category, script,
  age and assigned.
- **`src/ui/*`** holds the React UI: search, property highlight, legend, timeline,
  breadcrumb, detail panel, tooltip and minimap.

## Upgrading Unicode

1. Change `unicodeVersion` in `flake.nix`.
2. Update the three hashes. `nix store prefetch-file --unpack <url>` for the zips, without
   `--unpack` for `confusables.txt`.
3. Run `pnpm data`. It warns about any new scripts that need a region in
   `SCRIPT_REGION`.
