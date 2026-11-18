"""Re-encode fonts as WOFF2, for the web: the same tables, Brotli-compressed, at about half the size.

Usage: woff2.py FONT...   (writes FONT's stem + .woff2 beside it, and removes FONT)

The conversion is lossless (fontTools' woff2.compress copies the tables rather than rebuilding
them), and every browser the app supports reads WOFF2.
"""

import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from fontTools.ttLib import woff2


def to_woff2(path: str) -> str:
    """Write a WOFF2 copy of the font at `path` beside it, remove the original, and return the new name."""
    out = os.path.splitext(path)[0] + ".woff2"
    woff2.compress(path, out)
    os.remove(path)
    return out


def to_woff2_all(paths: list[str]) -> list[str]:
    """
    to_woff2 for each path, several at once: Brotli is slow, and uses one core per font. Each
    runs as its own `woff2.py` process, started from a thread (rather than through
    multiprocessing, which on macOS would re-run the calling script in every worker).
    """
    # Nix says how many cores a build may use (0 for all of them).
    cores = int(os.environ.get("NIX_BUILD_CORES", "0")) or os.cpu_count() or 1
    run = lambda p: subprocess.run([sys.executable, os.path.abspath(__file__), p], check=True)  # noqa: E731
    with ThreadPoolExecutor(max_workers=cores) as pool:
        list(pool.map(run, paths))
    return [os.path.splitext(p)[0] + ".woff2" for p in paths]


if __name__ == "__main__":
    # One font from to_woff2_all, or several from the command line, in turn.
    for p in sys.argv[1:]:
        to_woff2(p)
