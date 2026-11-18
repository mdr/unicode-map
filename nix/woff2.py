"""Re-encode fonts as WOFF2, for the web: the same tables, Brotli-compressed, at about half the size.

Usage: woff2.py FONT...   (writes FONT's stem + .woff2 beside it, and removes FONT)

The conversion is lossless (fontTools' woff2.compress copies the tables rather than rebuilding
them), and every browser the app supports reads WOFF2.
"""

import os
import sys

from fontTools.ttLib import woff2


def to_woff2(path: str) -> str:
    """Write a WOFF2 copy of the font at `path` beside it, remove the original, and return the new name."""
    out = os.path.splitext(path)[0] + ".woff2"
    woff2.compress(path, out)
    os.remove(path)
    return out


if __name__ == "__main__":
    for p in sys.argv[1:]:
        to_woff2(p)
