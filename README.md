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
pnpm dev             # http://localhost:5173
```

Re-run `pnpm data` after changing `scripts/build_data.py` or bumping the Unicode version.

## How it fits together

- **`flake.nix`** pins the Unicode version (`unicodeVersion`) and fetches `UCD.zip`,
  `Unihan.zip` and `confusables.txt` with fixed hashes. The `fonts` package assembles a
  font set that browsers can load: one regular face per Noto family, single faces extracted
  from the CJK collections, and Noto Color Emoji. Gap fillers come after Noto:
  - Jigmo, for the CJK extensions.
  - Kreative Square, for Legacy Computing.
  - Kaiyuan Small Seal, for Seal. It isn't released yet, so it's built from its glyph
    sources at a pinned commit.
  - Unifont, a pixel font, for the few things nothing else covers.

  Last Resort is the final placeholder. Inter and JetBrains Mono are the interface fonts.
  The package also writes a `manifest.json` recording each font's coverage. The dev shell exports the paths as `UCD_DIR`, `UNIHAN_DIR`, `CONFUSABLES` and
  `FONTS_DIR`.
- **`scripts/build_data.py`** (stdlib only) turns those into:
  - `meta.json`: blocks, code chart sections, regions, property values, and run-length
    maps of General Category, Script, Age and font per code point.
  - `props.json`: code point ranges for every binary property and a few enumerated ones
    (bidi class, width, line break, decomposition, numeric and joining type). The property
    highlighter loads it on first use.
  - `names.txt`: names and aliases, used for search.
  - `detail/NN.json`: per-character detail in 4,096-code-point chunks, loaded on demand.
  - `fonts.css`: an `@font-face` per font.
  - `coverage.json`: assigned characters that no Noto font covers.
- **`src/map/MapView.ts`** is the canvas renderer. Each plane is a 256×256 bitmap, scaled
  up, at low zoom. Grid lines fade in as you zoom, then cards with glyphs, code points and
  names. Block outlines and labels sit on top, with sticky row and column axes. At mid zoom,
  blocks split into their code chart sections (the `@` subheadings in `NamesList.txt`). It
  also dims everything outside a property highlight and hides characters newer than the
  timeline's version.
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
