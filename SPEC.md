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
- **Glyphs:** Noto fonts via Nix. Gaps are filled by Jigmo (CJK extensions), Kreative
  Square (Legacy Computing), Kaiyuan Small Seal (Seal), UniHieroglyphica (Egyptian
  Hieroglyphs Extended-A) and Unifont (pixel fallback), with Last Resort for anything left.
  A coverage report lists what remains.
- **Colour modes:**
  - Region (the default)
  - General category
  - Script
  - Unicode version (age)
  - Assigned or unassigned

  Each mode has a legend: hover over an entry to highlight it, click to pin it.
- **Timeline:** a slider from Unicode 1.1 to the current version. The map shows only what
  existed at the chosen version, with characters and blocks added per version. A play button
  animates it.
- **Property highlight:** pick any binary property (Emoji, Math, Dash…) or a value of bidi
  class, East Asian width, line break, decomposition, numeric or joining type. Everything
  else is dimmed.
- **Chart sections:** at mid zoom, blocks are divided into the named sections of the code
  charts.
- **About cards:** what a script or block is, from Wikipedia summaries (fetched ahead of time
  and committed) and CLDR script facts, for the selected character and from the sidebar.
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
  - Breadcrumb, and a sidebar that follows where you are.
  - Chart view: a block in columns of 16, like the Unicode code charts, with sections and a
    names list.
  - Links to each character's page on unicode.org, its code chart and Unihan entry.
  - Keyboard shortcuts.
  - URL hash state (selection, mode, view), with back and forward working.

## Later, maybe

- A Hilbert-curve layout as an alternative.
- Multiple Unicode versions, and the differences between them.
- Favourites, or a tray for collecting characters.
- Fonts for the remaining gaps: Jurchen, Archaic Cuneiform Numerals, the Tangut supplements
  and the last 348 Seal characters. None was in nixpkgs or freely available as of
  Unicode 18.
- Publishing (GitHub Pages), which means caring about size and mobile.
