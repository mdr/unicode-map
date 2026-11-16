# Third-party notices

The code in this repository is MIT licensed (see `LICENSE`). The published site also
includes data and fonts from other projects, under their own licences. None of them is
stored in this repository except the Wikipedia summaries; the rest are fetched at build
time, pinned by hash in `flake.nix`.

## Data

- **Unicode Character Database, Unihan and UTS #39 confusables** (Unicode 18.0.0), and
  **Unicode CLDR 49**: © Unicode, Inc. Used under the
  [Unicode License v3](https://www.unicode.org/license.txt). The site's `data/` files are
  derived from them.
- **Script and block summaries** (`src/data/about.json`): from
  [English Wikipedia](https://en.wikipedia.org/), under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Each summary links to
  its article, whose history lists the authors. This file is CC BY-SA 4.0, not MIT.

## Fonts

All are redistributed unmodified, except that a copy of Last Resort gets an extra cmap
subtable (see `scripts/build_data.py`) and single faces are extracted from the Noto CJK
collections.

| Font | Licence | Source |
| --- | --- | --- |
| Noto Sans, Serif and script families; Noto Sans CJK | SIL OFL 1.1 | https://github.com/notofonts |
| Noto Color Emoji | SIL OFL 1.1 (images Apache 2.0) | https://github.com/googlefonts/noto-emoji |
| Jigmo | CC0 1.0 | https://kamichikoichi.github.io/jigmo/ |
| Kreative Square | SIL OFL 1.1 | https://github.com/kreativekorp/open-relay |
| Kaiyuan Small Seal | SIL OFL 1.1 | https://github.com/frankslin/kaiyuan-small-seal-font |
| UniHieroglyphica | SIL OFL 1.1 | https://github.com/thesaurus-linguae-aegyptiae/unihieroglyphica |
| GNU Unifont | GPL 2.0 or later with the GNU font embedding exception (also SIL OFL 1.1) | https://unifoundry.com/unifont/ |
| Last Resort | SIL OFL 1.1 | https://github.com/unicode-org/last-resort-font |
| Inter | SIL OFL 1.1 | https://github.com/rsms/inter |
| JetBrains Mono | SIL OFL 1.1 | https://github.com/JetBrains/JetBrainsMono |
