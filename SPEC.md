# Unicode Map: requirements

A polished, interactive, zoomable map of the Unicode code space. It should make it clear
what each code point is, and which plane, block, region and category it belongs to.

## Scope (v1)

- **Audience:** a personal exploration tool, run locally. It's a static site so it can be
  published later.
- **Stack:** TypeScript, Vite and React. The map is drawn on a canvas. A Nix flake provides
  all the tooling, the pinned Unicode data and the fonts.
- **Data:** the latest Unicode release (18.0.0), pinned with hashes. The data comes from
  the UCD, Unihan and UTS #39 confusables.
- **Layout:** linear. 17 planes of 256×256 cells (256 code points per row), arranged in a
  grid of planes. Zooming goes smoothly from planes, to blocks, to rows, to single code
  points.
- **Glyphs:** Noto fonts via Nix, with Last Resort as the fallback, plus a coverage report
  of the gaps.
- **Colour modes:**
  - Region (the default)
  - General category
  - Script
  - Unicode version (age)
  - Assigned or unassigned

  Each mode has a legend: hover over an entry to highlight it, click to pin it.
- **Detail panel:**
  - Basics: name, block, plane, category, script, age.
  - Encodings: UTF-8, UTF-16 and UTF-32, plus HTML, CSS, JavaScript, Python and URL
    escapes.
  - Properties: bidi class, combining class, width, line break, binary properties.
  - Relationships: aliases, NamesList annotations and cross-references, decomposition,
    case mappings, confusables.
  - Unihan: definitions, readings, radical and strokes, variants.
- **Navigation:**
  - Search by name or alias, code point notation, pasted text, or block name.
  - Breadcrumb and minimap.
  - Keyboard shortcuts.
  - URL hash state (selection, mode, view), with back and forward working.

## Later, maybe

- A Hilbert-curve layout as an alternative.
- Multiple Unicode versions, and the differences between them.
- Filtering by property, favourites.
- Fonts to fill the CJK extension gaps (for example Jigmo, which is in nixpkgs).
- Publishing (GitHub Pages), which means caring about size and mobile.
