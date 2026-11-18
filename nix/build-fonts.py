"""Assemble a web-servable font set and record each font's coverage.

Usage: build-fonts.py OUT_DIR FONT_PACKAGE...

Picks one regular face per Noto family, extracts single faces from CJK .ttc
collections (browsers can't load collections), re-encodes each as WOFF2 (see woff2.py), and
writes OUT_DIR/manifest.json:

  {"fonts": [{"file": "NotoSans.woff2", "family": "Noto Sans", "ranges": [[32, 126], ...]}, ...]}
"""

import json
import os
import re
import shutil
import sys

from fontTools.ttLib import TTCollection, TTFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from woff2 import to_woff2  # noqa: E402

out_dir = sys.argv[1]
pkg_dirs = sys.argv[2:]
os.makedirs(out_dir)

# Files we never want: alternate styles, UI/display variants, test fonts, and
# stylistic alternates of a script that already has a primary font.
EXCLUDE = re.compile(
    r"(Italic|-UI|UI\.|UI-|Display|Test|Unjoined|Looped|Mono|Rotated|Vertical"
    r"|Syriac(Eastern|Western)|Tifinagh[A-Z]|Rashi|TraditionalNushu"
    r"|KreativeSquareSM|unifont_(t|jp|csur)\.|SealCompat"
    r"|-(Thin|ExtraLight|Light|Medium|SemiBold|Bold|ExtraBold|Black)\.)"
)

# Prefer this face from CJK collections.
CJK_FACE = re.compile(r"CJK SC\b")


def family_name(font):
    name = font["name"]
    for name_id in (16, 1):
        rec = name.getName(name_id, 3, 1) or name.getName(name_id, 1, 0)
        if rec:
            return str(rec)
    return "?"


def ranges_of(cps):
    out = []
    for cp in sorted(cps):
        if out and out[-1][1] == cp - 1:
            out[-1][1] = cp
        else:
            out.append([cp, cp])
    return out


def coverage(font):
    cmap = font.getBestCmap() or {}
    # Last Resort uses a format 13 cmap covering everything; getBestCmap handles it.
    return ranges_of(cmap.keys())


entries = []
for pkg in pkg_dirs:
    for root, _dirs, files in os.walk(pkg):
        for fname in sorted(files):
            path = os.path.join(root, fname)
            lower = fname.lower()
            if lower.endswith((".ttc", ".otc")):
                coll = TTCollection(path)
                for font in coll.fonts:
                    fam = family_name(font)
                    if not CJK_FACE.search(fam) or "Mono" in fam:
                        continue
                    out_name = re.sub(r"[^A-Za-z0-9]+", "", fam) + (".otf" if "CFF " in font or "CFF2" in font else ".ttf")
                    font.save(os.path.join(out_dir, out_name))
                    entries.append({"file": out_name, "family": fam, "ranges": coverage(font)})
                    break
            elif lower.endswith((".ttf", ".otf")):
                if EXCLUDE.search(fname):
                    continue
                font = TTFont(path, lazy=True)
                fam = family_name(font)
                shutil.copy(path, os.path.join(out_dir, fname))
                os.chmod(os.path.join(out_dir, fname), 0o644)
                entries.append({"file": fname, "family": fam, "ranges": coverage(font)})

# If a family appears twice (e.g. NotoSansDuployan .ttf and -Regular.otf), keep the larger.
by_family = {}
for e in entries:
    size = sum(b - a + 1 for a, b in e["ranges"])
    if e["family"] not in by_family or size > by_family[e["family"]][0]:
        by_family[e["family"]] = (size, e)
kept = [e for _, e in by_family.values()]
for e in entries:
    if e not in kept:
        os.remove(os.path.join(out_dir, e["file"]))

for e in kept:
    e["file"] = os.path.basename(to_woff2(os.path.join(out_dir, e["file"])))

with open(os.path.join(out_dir, "manifest.json"), "w") as f:
    json.dump({"fonts": kept}, f)

print(f"{len(kept)} fonts", file=sys.stderr)
