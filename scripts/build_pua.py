"""Compile interpretations of the Private Use Areas for the app.

Private-use code points have no meaning in Unicode itself: anyone may give them one. An
interpretation is one such set of meanings, which the map can show in place of blank cells.
For now there's one, ConScript: the Under-ConScript Unicode Registry (UCSUR), where constructed
and fictional scripts (Tengwar, Klingon, sitelen pona…) get agreed code points. UCSUR carries
on from the original ConScript Unicode Registry and contains nearly all of it.

Reads paths from the environment set up by `nix develop`:
  PUA_DATA_DIR    Kreative Software's PUA data (github.com/kreativekorp/charset, puadata/)
  PUA_FONTS_DIR   fonts for the interpretations, built by Nix

Writes:
  public/data/pua/conscript.json   names, general categories, blocks and fonts (see below)
  public/fonts-pua -> $PUA_FONTS_DIR

conscript.json:
  {"id", "name", "source", "url",
   "fonts": [{"family", "file"}, ...],
   "blocks": [[start, end, name], ...],
   "chars": [[cp, name, gc, font index or -1], ...]}
"""

import json
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "pua")


def env(name):
    v = os.environ.get(name)
    if not v:
        sys.exit(f"{name} is not set; run this inside `nix develop`")
    return v


PUA_DATA = env("PUA_DATA_DIR")
PUA_FONTS = env("PUA_FONTS_DIR")

# Fonts in the order they're preferred: a script's own font, then outline fonts, then pixel glyphs.
FONTS = [
    ("nasin-nanpa", "nasin-nanpa.otf"),
    ("Constructium", "Constructium.ttf"),
    ("Fairfax HD", "FairfaxHD-PUA.ttf"),
    ("Unifont CSUR", "unifont_csur.otf"),
]


def expand(path):
    """A file of Kreative's PUA data, with its `@import`s followed and other directives dropped."""
    lines = []
    with open(os.path.join(PUA_DATA, path), encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if line.startswith("@import "):
                lines += expand(line.split(None, 1)[1].strip())
            elif line and not line.startswith(("@", "#")):
                lines.append(line)
    return lines


def ucsur():
    chars = {}
    for line in expand("public/ucsur/unicodedata.txt"):
        f = line.split(";")
        chars[int(f[0], 16)] = (f[1], f[2])
    blocks = []
    for line in expand("public/ucsur/blocks.txt"):
        rng, name = line.split(";")
        a, b = (int(x, 16) for x in rng.split(".."))
        # Skip the stretch UCSUR leaves for private use, and blocks with nothing in them yet.
        if any(a <= cp <= b for cp in chars) and name.strip() != "Private Use Area":
            blocks.append([a, b, name.strip()])
    return chars, blocks


def glyph_coverage(file):
    """The code points a font really draws. Unifont maps code points it has no glyph for to boxes
    showing their hex code, which fill the whole 16-pixel cell (y from -4 to 52); those are left out."""
    font = TTFont(os.path.join(PUA_FONTS, file))
    cmap = font.getBestCmap()
    if not file.startswith("unifont"):
        return set(cmap)
    glyphs = font.getGlyphSet()

    def hex_box(name):
        pen = BoundsPen(glyphs)
        glyphs[name].draw(pen)
        return pen.bounds == (0, -4, glyphs[name].width, 52)

    return {cp for cp, name in cmap.items() if not hex_box(name)}


def assign_fonts(chars, blocks, cmaps):
    """Font per code point: each block's primary font where it has the glyph, else the first that does."""
    font_of = {}
    for a, b, _name in blocks:
        cps = [cp for cp in chars if a <= cp <= b]
        counts = [sum(cp in cm for cp in cps) for cm in cmaps]
        best = max(counts)
        # The most preferred font that covers most of what the best one covers.
        primary = next(i for i, n in enumerate(counts) if n >= 0.6 * best) if best else -1
        for cp in cps:
            if primary >= 0 and cp in cmaps[primary]:
                font_of[cp] = primary
            else:
                font_of[cp] = next((i for i, cm in enumerate(cmaps) if cp in cm), -1)
    return font_of


chars, blocks = ucsur()
outside = [cp for cp in chars if not any(a <= cp <= b for a, b, _ in blocks)]
if outside:
    sys.exit(f"{len(outside)} UCSUR characters are outside its blocks, e.g. U+{outside[0]:04X}")
cmaps = [glyph_coverage(file) for _fam, file in FONTS]
font_of = assign_fonts(chars, blocks, cmaps)

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "conscript.json"), "w", encoding="utf-8") as fh:
    json.dump(
        {
            "id": "conscript",
            "name": "ConScript",
            "source": "Under-ConScript Unicode Registry",
            "url": "https://www.kreativekorp.com/ucsur/",
            "fonts": [{"family": fam, "file": file} for fam, file in FONTS],
            "blocks": blocks,
            "chars": [[cp, name, gc, font_of[cp]] for cp, (name, gc) in sorted(chars.items())],
        },
        fh,
        separators=(",", ":"),
        ensure_ascii=False,
    )

link = os.path.join(ROOT, "public", "fonts-pua")
if os.path.islink(link) or os.path.exists(link):
    os.remove(link)
os.symlink(PUA_FONTS, link)

drawn = [f for f in font_of.values() if f >= 0]
print(f"ConScript: {len(chars)} characters in {len(blocks)} blocks; {len(chars) - len(drawn)} without a glyph")
print("  drawn by " + ", ".join(f"{FONTS[i][0]} {drawn.count(i)}" for i in range(len(FONTS))))
