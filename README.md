# Unicode Map

An interactive, zoomable map of the whole Unicode code space: all 1,114,112 code points,
from the 17 planes down to individual characters.

**Live site:** https://mdr.github.io/unicode-map/

## Running it

Everything comes from the Nix flake: Node, pnpm, Python with fontTools, the Unicode data
files and the fonts.

```sh
nix develop          # or `direnv allow` (there's an .envrc)
pnpm install         # once
pnpm data            # compile the UCD into public/data and link the fonts (~30s)
pnpm tiles           # optional: pre-build pure view's glyph tiles into public/tiles (~1 min)
pnpm about           # rarely: refresh the Wikipedia summaries in src/data/about*.json (committed)
pnpm dev             # http://localhost:5173
```

Re-run `pnpm data` after changing `scripts/build_data.py` or bumping the Unicode version,
and `pnpm tiles` after that or after changing the fonts. `pnpm tiles` draws the tiles with the
app itself in headless Google Chrome (set `CHROME` to use another binary). Without the tiles,
pure view draws them in the browser instead, which is slower to fill in.

## How it fits together

- **`flake.nix`** pins the Unicode version (`unicodeVersion`) and fetches `UCD.zip`,
  `Unihan.zip`, `confusables.txt` and CLDR's `cldr-common` with fixed hashes. The `fonts` package assembles a
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
  Block outlines and labels sit on top, with sticky row and column axes. Labels come in three
  steps as you zoom in, one kind at a time: big landmark names centred in multi-row blocks,
  then a label at the start of every block, then the code chart sections (the `@` subheadings
  in `NamesList.txt`) once glyphs are readable. Labels sit at the cell where their range
  starts, are placed in priority order, and are skipped rather than truncated or overlapped.
  Clicking a block lands at its start at a readable zoom and keeps it outlined.
  The renderer also dims everything outside a highlight (rare matches get rings when zoomed
  out) and hides characters newer than the timeline's version. Pure view (`z`) drops the
  colours, labels and interface. Chart view (`c`) shows a block like Unicode's code charts,
  in columns of 16 with its sections marked, and a names list beside small blocks. In it, glyphs show from mid zoom using a pyramid of tile
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
- **`scripts/build_about.mjs`** fetches short descriptions of scripts and blocks from English
  Wikipedia into `src/data/about.json`, which is committed so builds never contact Wikipedia.
  Scripts are matched to articles through Wikidata (ISO 15924 code to article), blocks through
  their "(Unicode block)" articles. Raw responses are cached in `.cache/about`; `--refresh`
  fetches again. The app shows them as "About" cards (for a selected character, and from the ⓘ
  on block rows in the sidebar), with facts per script from CLDR (`CLDR_DIR`, pinned in the
  flake): how widely it's used, where it comes from, direction, case, and its main languages.
  It also writes `src/data/about-chars.json`: summaries of the ~2,400 characters with an
  English Wikipedia article of their own (Wikidata's "Unicode hex codepoint" and "Unicode
  character" links), keeping only articles whose short description says they're about a
  character, not something it depicts (🦦 → Otter), and checking the script against the
  character's name. `--report` writes what it kept and dropped to `.cache/about/` for review.
- **`src/map/colorModes.ts`** defines the colour modes: region, general category, script,
  age and assigned.
- **`src/ui/*`** holds the React UI: search, property highlight, legend, timeline,
  breadcrumb, detail panel and tooltip.

## Upgrading Unicode

1. Change `unicodeVersion` in `flake.nix`.
2. Update the three hashes. `nix store prefetch-file --unpack <url>` for the zips, without
   `--unpack` for `confusables.txt`.
3. Run `pnpm data`. It warns about any new scripts that need a region in
   `SCRIPT_REGION`.

## Publishing

`.github/workflows/pages.yml` builds the site (data, tiles, then Vite) on every push to
`main` and publishes it to GitHub Pages.

## Licence

The code is MIT licensed (see `LICENSE`). The site also includes Unicode data, fonts and
Wikipedia text under their own licences; see `THIRD_PARTY_NOTICES.md`.
