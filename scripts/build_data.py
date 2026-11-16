"""Compile the Unicode Character Database into compact files for the app.

Reads paths from the environment set up by `nix develop`:
  UNICODE_VERSION, UCD_DIR, UNIHAN_DIR, CONFUSABLES, FONTS_DIR, CLDR_DIR

Writes into public/:
  data/meta.json        blocks, regions, property value lists, run-length property maps
  data/names.txt        one line per explicitly named code point: HEX<TAB>NAME<TAB>alias|alias
  data/detail/NN.json   per-code-point detail, one file per 0x1000 code points
  data/fonts.css        @font-face rules (family "UMap") with per-font unicode-range
  data/LastResort.ttf   Last Resort with a cmap all browsers read (needs fontTools)
  data/coverage.json    assigned graphic code points with no Noto glyph, by block
  fonts -> $FONTS_DIR   symlink to the font set built by Nix
"""

import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data")
MAX = 0x110000


def env(name):
    v = os.environ.get(name)
    if not v:
        sys.exit(f"{name} is not set; run this inside `nix develop`")
    return v


VERSION = env("UNICODE_VERSION")
UCD = env("UCD_DIR")
UNIHAN = env("UNIHAN_DIR")
CONFUSABLES = env("CONFUSABLES")
FONTS = env("FONTS_DIR")
CLDR = os.path.join(env("CLDR_DIR"), "common")


def ucd(*parts):
    return os.path.join(UCD, *parts)


def data_lines(path):
    """Yield lists of stripped fields for each non-comment line of a UCD-style file."""
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if line:
                yield [p.strip() for p in line.split(";")]


def cp_range(s):
    if ".." in s:
        a, b = s.split("..")
        return int(a, 16), int(b, 16)
    v = int(s, 16)
    return v, v


def hexcp(cp):
    return f"{cp:04X}"


# ---------------------------------------------------------------------------
# Property value aliases
# ---------------------------------------------------------------------------
pva = defaultdict(dict)  # prop -> short -> long
for f in data_lines(ucd("PropertyValueAliases.txt")):
    prop, short, long_ = f[0], f[1], f[2]
    if prop == "ccc":
        short, long_ = f[1], f[3]
    pva[prop][short] = long_
script_long_to_short = {v: k for k, v in pva["sc"].items()}

# ---------------------------------------------------------------------------
# Core per-code-point arrays
# ---------------------------------------------------------------------------
gc = ["Cn"] * MAX
for f in data_lines(ucd("extracted", "DerivedGeneralCategory.txt")):
    a, b = cp_range(f[0])
    for cp in range(a, b + 1):
        gc[cp] = f[1]

script = ["Zzzz"] * MAX
for f in data_lines(ucd("Scripts.txt")):
    a, b = cp_range(f[0])
    s = script_long_to_short[f[1]]
    for cp in range(a, b + 1):
        script[cp] = s

age = [""] * MAX
for f in data_lines(ucd("DerivedAge.txt")):
    a, b = cp_range(f[0])
    for cp in range(a, b + 1):
        age[cp] = f[1]

blocks = []
for f in data_lines(ucd("Blocks.txt")):
    a, b = cp_range(f[0])
    blocks.append({"s": a, "e": b, "name": f[1]})
block_of = [-1] * MAX
for i, blk in enumerate(blocks):
    for cp in range(blk["s"], blk["e"] + 1):
        block_of[cp] = i

# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------
names = {}
name_ranges = []  # [start, end, prefix]
for f in data_lines(ucd("extracted", "DerivedName.txt")):
    a, b = cp_range(f[0])
    if f[1].endswith("*"):
        name_ranges.append([a, b, f[1][:-1]])
    else:
        names[a] = f[1]

aliases = defaultdict(list)  # cp -> [(alias, type)]
for f in data_lines(ucd("NameAliases.txt")):
    aliases[int(f[0], 16)].append((f[1], f[2]))

# ---------------------------------------------------------------------------
# UnicodeData.txt: bidi, ccc, decomposition, numeric, mirrored, simple case
# ---------------------------------------------------------------------------
ud = {}
with open(ucd("UnicodeData.txt"), encoding="utf-8") as fh:
    for line in fh:
        f = line.rstrip("\n").split(";")
        cp = int(f[0], 16)
        ud[cp] = f

# ---------------------------------------------------------------------------
# Misc enumerated properties (only stored for detail)
# ---------------------------------------------------------------------------
def enum_prop(path, field=1):
    out = {}
    for f in data_lines(path):
        a, b = cp_range(f[0])
        for cp in range(a, b + 1):
            out[cp] = f[field]
    return out


bidi = enum_prop(ucd("extracted", "DerivedBidiClass.txt"))
eaw = enum_prop(ucd("EastAsianWidth.txt"))
lb = enum_prop(ucd("LineBreak.txt"))

scx = {}
for f in data_lines(ucd("ScriptExtensions.txt")):
    a, b = cp_range(f[0])
    for cp in range(a, b + 1):
        scx[cp] = f[1].split()

# Binary properties of interest
BINARY_FILES = [ucd("PropList.txt"), ucd("DerivedCoreProperties.txt"), ucd("emoji", "emoji-data.txt")]
SKIP_BINARY = {
    "Other_Alphabetic", "Other_Lowercase", "Other_Uppercase", "Other_Math",
    "Other_Grapheme_Extend", "Other_ID_Start", "Other_ID_Continue",
    "Other_Default_Ignorable_Code_Point", "Grapheme_Base", "XID_Start",
    "XID_Continue", "ID_Continue", "Changes_When_Casefolded",
    "Changes_When_Casemapped", "Changes_When_Lowercased", "Changes_When_Titlecased",
    "Changes_When_Uppercased", "InCB", "Case_Ignorable", "Grapheme_Link",
}
binary_names = []
binary = defaultdict(list)  # cp -> [prop index]
for path in BINARY_FILES:
    for f in data_lines(path):
        prop = f[1]
        if prop in SKIP_BINARY or len(f) > 2:
            continue
        if prop not in binary_names:
            binary_names.append(prop)
        idx = binary_names.index(prop)
        a, b = cp_range(f[0])
        for cp in range(a, b + 1):
            if idx not in binary[cp]:
                binary[cp].append(idx)
idx_ext_pict = binary_names.index("Extended_Pictographic")
idx_emoji_pres = binary_names.index("Emoji_Presentation")
idx_nonchar = binary_names.index("Noncharacter_Code_Point")

# ---------------------------------------------------------------------------
# NamesList.txt annotations: subheadings, informal aliases, comments, cross refs
# ---------------------------------------------------------------------------
nl = defaultdict(lambda: defaultdict(list))
subhead = {}
sections = []  # [start, end, title]: chart sections ("@" subheadings) within blocks
current_sub = None
current = None
XREF = re.compile(r"([0-9A-F]{4,6})\)?\s*$")
with open(ucd("NamesList.txt"), encoding="utf-8") as fh:
    for line in fh:
        line = line.rstrip("\n")
        if not line or line.startswith(";"):
            continue
        if line.startswith("@@\t"):
            current_sub = None
            current = None
        elif line.startswith("@\t"):
            current_sub = line.split("\t")[-1].strip()
            sections.append([None, None, current_sub])
            current = None
        elif line.startswith("@"):
            current = None
        elif re.match(r"^[0-9A-F]{4,6}\t", line):
            current = int(line.split("\t")[0], 16)
            if current_sub:
                subhead[current] = current_sub
                sec = sections[-1]
                if sec[0] is None:
                    sec[0] = current
                sec[1] = current
        elif line.startswith("\t") and current is not None:
            body = line.strip()
            kind, text = body[0], body[1:].strip()
            if kind == "x":
                m = XREF.search(text)
                if m:
                    nl[current]["x"].append(int(m.group(1), 16))
            elif kind in "=*%~":
                nl[current][kind].append(text)

# ---------------------------------------------------------------------------
# Confusables
# ---------------------------------------------------------------------------
confusable_target = {}
confusable_group = defaultdict(list)
for f in data_lines(CONFUSABLES):
    src = [int(x, 16) for x in f[0].split()]
    if len(src) != 1:
        continue
    tgt = tuple(int(x, 16) for x in f[1].split())
    confusable_target[src[0]] = tgt
    confusable_group[tgt].append(src[0])

# ---------------------------------------------------------------------------
# Unihan
# ---------------------------------------------------------------------------
UNIHAN_FIELDS = {
    "kDefinition": "def", "kMandarin": "mandarin", "kCantonese": "cantonese",
    "kJapanese": "japanese", "kJapaneseOn": "jaOn", "kJapaneseKun": "jaKun",
    "kKorean": "korean", "kHangul": "hangul", "kVietnamese": "vietnamese",
    "kRSUnicode": "rs", "kTotalStrokes": "strokes",
    "kSimplifiedVariant": "simplified", "kTraditionalVariant": "traditional",
    "kSemanticVariant": "semantic", "kZVariant": "zvariant",
    "kGradeLevel": "grade", "kJoyoKanji": "joyo",
}
radicals = {}
for f in data_lines(ucd("CJKRadicals.txt")):
    radicals[f[0]] = chr(int(f[2], 16))  # radical number (possibly with ') -> unified ideograph

unihan = defaultdict(dict)
for fname in sorted(os.listdir(UNIHAN)):
    if not fname.endswith(".txt"):
        continue
    with open(os.path.join(UNIHAN, fname), encoding="utf-8") as fh:
        for line in fh:
            if not line.startswith("U+"):
                continue
            cp_s, key, value = line.rstrip("\n").split("\t", 2)
            if key in UNIHAN_FIELDS:
                unihan[int(cp_s[2:], 16)][UNIHAN_FIELDS[key]] = value


def variant_cps(value):
    out = []
    for tok in value.split():
        m = re.match(r"U\+([0-9A-F]+)", tok)
        if m:
            cp = int(m.group(1), 16)
            if cp not in out:
                out.append(cp)
    return out


# ---------------------------------------------------------------------------
# Regions: broad groupings of blocks, after the Unicode code chart index
# ---------------------------------------------------------------------------
REGIONS = [
    ("european", "European scripts", "#5b8def"),
    ("african", "African scripts", "#e0a43a"),
    ("middle-eastern", "Middle Eastern scripts", "#d8734a"),
    ("central-asian", "Central Asian scripts", "#b58ad6"),
    ("south-asian", "South Asian scripts", "#e2607f"),
    ("southeast-asian", "Southeast Asian scripts", "#3fbf8f"),
    ("indonesian", "Indonesian & Philippine scripts", "#8cc152"),
    ("east-asian", "East Asian scripts", "#e5534b"),
    ("american", "American scripts", "#c7a26b"),
    ("marks", "Diacritics & modifiers", "#9aa8bd"),
    ("symbols", "Symbols & punctuation", "#3fb6c9"),
    ("emoji", "Emoji & pictographs", "#f2c94c"),
    ("notation", "Notational systems", "#a982ff"),
    ("special", "Private use & special", "#7c7f8a"),
]
SCRIPT_REGION = {}
for region, scripts in {
    "european": "Latin Greek Cyrillic Armenian Georgian Glagolitic Gothic Ogham Runic Old_Italic Old_Permic "
    "Shavian Linear_A Linear_B Cypriot Cypro_Minoan Carian Lycian Lydian Elbasan Caucasian_Albanian "
    "Vithkuqi Old_Hungarian Todhri Sidetic",
    "african": "Adlam Bamum Bassa_Vah Coptic Egyptian_Hieroglyphs Ethiopic Garay Medefaidrin Mende_Kikakui "
    "Meroitic_Cursive Meroitic_Hieroglyphs Nko Osmanya Tifinagh Vai Beria_Erfe",
    "middle-eastern": "Arabic Hebrew Syriac Samaritan Mandaic Imperial_Aramaic Nabataean Palmyrene Hatran "
    "Old_North_Arabian Old_South_Arabian Phoenician Ugaritic Cuneiform Proto_Cuneiform Old_Persian Avestan "
    "Inscriptional_Pahlavi Inscriptional_Parthian Psalter_Pahlavi Elymaic Chorasmian Yezidi Anatolian_Hieroglyphs",
    "central-asian": "Mongolian Tibetan Phags_Pa Old_Turkic Old_Uyghur Sogdian Old_Sogdian Manichaean Marchen "
    "Zanabazar_Square Soyombo",
    "south-asian": "Bengali Devanagari Gujarati Gurmukhi Kannada Malayalam Oriya Sinhala Tamil Telugu Thaana "
    "Brahmi Kharoshthi Bhaiksuki Chakma Dives_Akuru Dogra Grantha Gunjala_Gondi Masaram_Gondi Kaithi Khojki "
    "Khudawadi Mahajani Modi Multani Nandinagari Newa Ol_Chiki Ol_Onal Saurashtra Sharada Siddham "
    "Sora_Sompeng Syloti_Nagri Takri Tirhuta Wancho Warang_Citi Lepcha Limbu Meetei_Mayek Toto "
    "Tulu_Tigalari Kirat_Rai Gurung_Khema Sunuwar Tolong_Siki Nag_Mundari Hanifi_Rohingya",
    "southeast-asian": "Thai Lao Khmer Myanmar Tai_Le New_Tai_Lue Tai_Tham Tai_Viet Kayah_Li Cham "
    "Pau_Cin_Hau Pahawh_Hmong Nyiakeng_Puachue_Hmong Miao Mro Lisu Tangsa Ahom Tai_Yo",
    "indonesian": "Balinese Javanese Sundanese Batak Buginese Makasar Rejang Kawi Tagalog Hanunoo Buhid Tagbanwa",
    "east-asian": "Han Hangul Hiragana Katakana Bopomofo Yi Tangut Khitan_Small_Script Nushu Jurchen Seal",
    "american": "Cherokee Canadian_Aboriginal Osage Deseret",
    "notation": "Braille SignWriting Duployan",
}.items():
    for s in scripts.split():
        SCRIPT_REGION[script_long_to_short[s]] = region

missing = [pva["sc"][s] for s in set(script) if s not in SCRIPT_REGION and s not in ("Zyyy", "Zinh", "Zzzz")]
if missing:
    print(f"warning: scripts with no region (defaulting to symbols): {sorted(missing)}", file=sys.stderr)

NAME_RULES = [
    (re.compile(r"Private Use|Surrogate|^Specials$|Variation Selectors|^Tags$"), "special"),
    (re.compile(r"Musical|Braille|Sutton|Shorthand|Znamenny|Tai Xuan|Counting Rod|Mayan Numerals|Kaktovik|Duployan|Byzantine"), "notation"),
    (re.compile(r"CJK|Kangxi|Ideographic|Kanbun|Hangul|Kana|Bopomofo|Halfwidth and Fullwidth|Vertical Forms|Small Form Variants|Yijing|Enclosed Ideographic"), "east-asian"),
    (re.compile(r"Combining|Modifier"), "marks"),
]


def block_region(blk):
    for pat, region in NAME_RULES:
        if pat.search(blk["name"]):
            return region
    cps = [cp for cp in range(blk["s"], blk["e"] + 1) if gc[cp] != "Cn"]
    if not cps:
        return "symbols"
    scripts = Counter(script[cp] for cp in cps)
    specific = [(n, s) for s, n in scripts.items() if s not in ("Zyyy", "Zinh", "Zzzz")]
    if specific:
        n, s = max(specific)
        if n >= 0.3 * len(cps):
            return SCRIPT_REGION.get(s, "symbols")
    if scripts.get("Zinh", 0) > 0.5 * len(cps):
        return "marks"
    pict = sum(1 for cp in cps if idx_ext_pict in binary[cp])
    if pict > 0.5 * len(cps):
        return "emoji"
    return "symbols"


region_index = {r[0]: i for i, r in enumerate(REGIONS)}
for blk in blocks:
    blk["region"] = region_index[block_region(blk)]
    blk["assigned"] = sum(1 for cp in range(blk["s"], blk["e"] + 1) if gc[cp] != "Cn")

# ---------------------------------------------------------------------------
# Fonts: choose one font per code point, emit @font-face with unicode-range
# ---------------------------------------------------------------------------
with open(os.path.join(FONTS, "manifest.json")) as fh:
    fonts = json.load(fh)["fonts"]

LAST_RESORT = next(f for f in fonts if "Last Resort" in f["family"])
fonts = [f for f in fonts if f is not LAST_RESORT]


def tier(family):
    """Lower is preferred when several fonts cover a block well."""
    if family == "Noto Sans":
        return 0
    if family in ("Noto Sans Symbols", "Noto Sans Symbols 2", "Noto Sans Math", "Noto Music"):
        return 2
    if "Emoji" in family:
        return EMOJI_TIER
    if "CJK" in family:
        return 3
    if family.startswith("Noto Sans"):
        return 1
    if family.startswith("Noto Serif") or family.startswith("Noto"):
        return 4
    if family.startswith("Unifont"):
        return PIXEL_TIER
    return 5  # non-Noto gap fillers: Jigmo, Kreative Square, Kaiyuan Small Seal, UniHieroglyphica


EMOJI_TIER = 6
PIXEL_TIER = 7  # Unifont: only for code points nothing else covers


for i, f in enumerate(fonts):
    f["tier"] = tier(f["family"])
    f["id"] = i
font_cover = [None] * MAX  # cp -> list of font ids
for f in fonts:
    for a, b in f["ranges"]:
        for cp in range(a, min(b, MAX - 1) + 1):
            if font_cover[cp] is None:
                font_cover[cp] = [f["id"]]
            else:
                font_cover[cp].append(f["id"])

NOT_DRAWN = {"Cn", "Cc", "Cs", "Co", "Zl", "Zp"}
idx_vs = binary_names.index("Variation_Selector")


def drawable(cp):
    return gc[cp] not in NOT_DRAWN and idx_vs not in binary.get(cp, ())


font_of = {}  # cp -> font id
uncovered = Counter()  # block index -> count
for bi, blk in enumerate(blocks):
    cps = [cp for cp in range(blk["s"], blk["e"] + 1) if drawable(cp)]
    counts = Counter()
    for cp in cps:
        for fid in font_cover[cp] or ():
            counts[fid] += 1
    primary = None
    non_emoji = {fid: n for fid, n in counts.items() if fonts[fid]["tier"] < EMOJI_TIER}
    pool = non_emoji or {fid: n for fid, n in counts.items() if fonts[fid]["tier"] != EMOJI_TIER} or counts
    if pool:
        # Among fonts that cover most of what the best one covers, prefer the lowest tier.
        best = max(pool.values())
        good = [fid for fid, n in pool.items() if n >= 0.6 * best]
        primary = min(good, key=lambda fid: (fonts[fid]["tier"], -pool[fid]))
    for cp in cps:
        cover = font_cover[cp] or []
        if not cover:
            uncovered[bi] += 1
            continue
        emoji = [fid for fid in cover if fonts[fid]["tier"] == EMOJI_TIER]
        if emoji and idx_emoji_pres in binary[cp]:
            font_of[cp] = emoji[0]
        elif primary in cover:
            font_of[cp] = primary
        else:
            others = [fid for fid in cover if fonts[fid]["tier"] != EMOJI_TIER] or cover
            font_of[cp] = min(others, key=lambda fid: (fonts[fid]["tier"], -counts[fid]))

cps_by_font = defaultdict(list)
for cp, fid in font_of.items():
    cps_by_font[fid].append(cp)


def to_ranges(cps):
    out = []
    for cp in sorted(cps):
        if out and out[-1][1] == cp - 1:
            out[-1][1] = cp
        else:
            out.append([cp, cp])
    return out


os.makedirs(OUT, exist_ok=True)
css = [f"/* Generated by scripts/build_data.py for Unicode {VERSION} */"]
# One family per font ("UMapF<id>"); the app picks the family per code point from meta.fontRuns,
# so a combining mark and its dotted-circle base are shaped by the same font.
for fid in sorted(cps_by_font):
    f = fonts[fid]
    fmt = "opentype" if f["file"].endswith(".otf") else "truetype"
    css.append(
        f'@font-face {{ font-family: "UMapF{fid}"; src: url("../fonts/{f["file"]}") format("{fmt}"); font-display: block; }}'
    )


def write_last_resort():
    """
    Copy Last Resort with a cmap every browser reads. Outside the BMP it maps code points only
    through a format 13 subtable (whole ranges to one glyph), which Firefox ignores: it then
    draws its own hex box, differently at different sizes. Add a format 12 subtable listing each
    assigned code point that no other font covers.
    """
    from fontTools.ttLib import TTFont
    from fontTools.ttLib.tables._c_m_a_p import cmap_format_12

    font = TTFont(os.path.join(FONTS, LAST_RESORT["file"]))
    full = font.getBestCmap()  # merges in the format 13 ranges
    mapping = {cp: g for cp, g in full.items() if cp <= 0xFFFF}
    for cp in range(0x10000, MAX):
        if gc[cp] not in ("Cn", "Co", "Cs") and cp not in font_of and cp in full:
            mapping[cp] = full[cp]
    sub = cmap_format_12(12)
    sub.platformID, sub.platEncID, sub.language = 3, 10, 0
    sub.cmap = mapping
    font["cmap"].tables = [t for t in font["cmap"].tables if t.format == 4] + [sub]
    font.save(os.path.join(OUT, "LastResort.ttf"))
    return len(mapping) - sum(1 for cp in mapping if cp <= 0xFFFF)


print(f"Last Resort: {write_last_resort()} supplementary code points mapped")
css.append(
    '@font-face { font-family: "UMap Last Resort"; src: url("LastResort.ttf") format("truetype"); font-display: block; }'
)
# Fallback for interface text Inter can't draw (e.g. Egyptological ꜣ ꞽ in NamesList notes).
NOTO_SANS = next(f for f in fonts if f["family"] == "Noto Sans")
css.append(
    f'@font-face {{ font-family: "UMap Text"; src: url("../fonts/{NOTO_SANS["file"]}") format("truetype"); font-weight: 100 900; font-display: swap; }}'
)
css.append('@font-face { font-family: "Inter"; src: url("../fonts/ui/Inter.ttf") format("truetype"); font-weight: 100 900; font-display: swap; }')
css.append('@font-face { font-family: "JetBrains Mono"; src: url("../fonts/ui/JetBrainsMono.ttf") format("truetype"); font-weight: 100 800; font-display: swap; }')
with open(os.path.join(OUT, "fonts.css"), "w") as fh:
    fh.write("\n".join(css) + "\n")

coverage = {
    "uncoveredTotal": sum(uncovered.values()),
    "drawableTotal": sum(1 for cp in range(MAX) if drawable(cp)),
    "byBlock": [
        {"block": blocks[bi]["name"], "uncovered": n, "assigned": blocks[bi]["assigned"]}
        for bi, n in uncovered.most_common()
    ],
}
with open(os.path.join(OUT, "coverage.json"), "w") as fh:
    json.dump(coverage, fh, indent=1)

# ---------------------------------------------------------------------------
# meta.json: property values and run-length maps
# ---------------------------------------------------------------------------
def runs(values, index):
    out = []
    prev = None
    for cp in range(MAX):
        v = index[values[cp]]
        if v != prev:
            out.extend([cp, v])
            prev = v
    return out


def abbreviate(cp):
    name = names.get(cp) or next((a for a, _t in aliases.get(cp, [])), "") or f"{cp:04X}"
    words = [w for w in re.split(r"[ -]", name) if w and w not in ("SPACE", "CHARACTER", "SIGN", "MARK")]
    return ("".join(w[0] for w in words)[:4] or "SP") if len(words) > 1 else (words[0][:4] if words else "SP")


def cldr_script_info():
    """
    Facts about each script from CLDR: how widely it's used, where it comes from, its direction
    and case, and the main languages written in it (by number of people, where CLDR knows).
    """
    import xml.etree.ElementTree as ET

    en = ET.parse(os.path.join(CLDR, "main", "en.xml")).getroot()
    lang_names = {e.get("type"): e.text for e in en.iter("language") if not e.get("alt")}
    territory_names = {e.get("type"): e.text for e in en.iter("territory") if not e.get("alt")}

    sup = ET.parse(os.path.join(CLDR, "supplemental", "supplementalData.xml")).getroot()
    lang_scripts = defaultdict(set)
    for e in sup.iter("language"):
        if e.get("scripts") and e.get("alt") != "secondary":
            lang_scripts[e.get("type")].update(e.get("scripts").split())
    # People per language (and per language-in-a-script, for types like "zh_Hant").
    speakers = Counter()
    for t in sup.iter("territory"):
        pop = t.get("population")
        if not pop:
            continue
        for lp in t.iter("languagePopulation"):
            speakers[lp.get("type")] += float(pop) * float(lp.get("populationPercent")) / 100

    # CLDR writes Chinese as Hans/Hant, Japanese as Jpan and Korean as Kore; Unicode's scripts are
    # Han, Hiragana, Katakana and Hangul.
    parts = {"Hans": ["Hani"], "Hant": ["Hani"], "Jpan": ["Hani", "Hira", "Kana"], "Kore": ["Hang", "Hani"]}
    by_script = defaultdict(Counter)

    def add(sc, lang, n):
        for u in parts.get(sc, [sc]):
            by_script[u][lang] = max(by_script[u][lang], n) if sc in parts else by_script[u][lang] + n

    for lang, scs in lang_scripts.items():
        for sc in scs:
            add(sc, lang, speakers.get(lang, 0))
    for typ, n in speakers.items():
        if "_" in typ:
            lang, sc = typ.split("_", 1)
            if len(sc) == 4 and sc[0].isupper():
                add(sc, lang, n)

    usage = {
        "RECOMMENDED": "widespread",
        "LIMITED_USE": "limited",
        "ASPIRATIONAL": "emerging",
        "EXCLUSION": "rare",
    }
    info = {}
    with open(os.path.join(CLDR, "properties", "scriptMetadata.txt"), encoding="utf-8") as fh:
        for line in fh:
            line = line.split("#")[0].strip()
            if not line:
                continue
            f = [x.strip() for x in line.split(";")]
            code = f[0]
            langs = sorted(by_script.get(code, {}).items(), key=lambda kv: (-kv[1], lang_names.get(kv[0], kv[0])))
            entry = {
                "usage": usage.get(f[5], "rare"),
                "origin": territory_names.get(f[3]) if f[3] not in ("ZZ", "001") else None,
                "rtl": f[6] == "YES",
                "hasCase": f[10] == "YES",
                "languages": [
                    {"name": lang_names.get(l, l), "people": int(round(n, -3))}
                    for l, n in langs[:6]
                    if lang_names.get(l)
                ],
                "languageCount": len(langs),
            }
            info[code] = {k: v for k, v in entry.items() if v not in (None, [], False)}
    return info


def font_runs():
    out = []
    prev = None
    for cp in range(MAX):
        v = font_of.get(cp, -1) + 1
        if v != prev:
            out.extend([cp, v])
            prev = v
    return out


gc_values = list(pva["gc"].keys())
gc_values = [g for g in gc_values if len(g) == 2 and g != "LC"]  # drop groupings like L, LC
script_values = sorted(set(script), key=lambda s: pva["sc"][s])
age_values = sorted({a for a in age if a}, key=lambda a: tuple(int(x) for x in a.split(".")))
age_values_all = [""] + age_values

meta = {
    "version": VERSION,
    "regions": [{"id": r[0], "name": r[1], "color": r[2]} for r in REGIONS],
    "blocks": blocks,
    "gc": [{"code": g, "name": pva["gc"][g].replace("_", " ")} for g in gc_values],
    "scripts": [
        {"code": s, "name": pva["sc"][s].replace("_", " "), "region": region_index.get(SCRIPT_REGION.get(s, ""), -1)}
        for s in script_values
    ],
    "ages": age_values_all,
    "runs": {
        "gc": runs(gc, {g: i for i, g in enumerate(gc_values)}),
        "script": runs(script, {s: i for i, s in enumerate(script_values)}),
        "age": runs(age, {a: i for i, a in enumerate(age_values_all)}),
    },
    "nameRanges": name_ranges,
    "binaryProps": binary_names,
    "fonts": [{"file": f["file"], "family": f["family"]} for f in fonts],
    "fontRuns": font_runs(),
    "scriptInfo": cldr_script_info(),
    "dottedCircleFont": font_of.get(0x25CC, -1),
    "fontsWithDottedCircle": sorted(fid for fid in cps_by_font if fid in (font_cover[0x25CC] or [])),
    "abbr": {
        f"{cp:X}": next((a for a, t in aliases.get(cp, []) if t == "abbreviation"), None) or abbreviate(cp)
        for cp in range(MAX)
        if gc[cp] in ("Cc", "Cf", "Zs", "Zl", "Zp") or idx_vs in binary.get(cp, ())
    },
    "sections": [sec for sec in sections if sec[0] is not None],
    "valueNames": {k: {a: b.replace("_", " ") for a, b in pva[k].items()} for k in ("bc", "ea", "lb", "ccc")},
    "nonchars": to_ranges(
        cp for cp in range(MAX) if idx_nonchar in binary.get(cp, ())
    ),
}
with open(os.path.join(OUT, "meta.json"), "w") as fh:
    json.dump(meta, fh, separators=(",", ":"))

# ---------------------------------------------------------------------------
# props.json: code point ranges for every binary property and selected enumerated
# properties, loaded on demand by the property highlighter
# ---------------------------------------------------------------------------
def prop_ranges(paths, skip=()):
    out = defaultdict(set)
    for path in paths:
        for f in data_lines(path):
            if len(f) > 2 or f[1] in skip:
                continue
            a, b = cp_range(f[0])
            out[f[1]].update(range(a, b + 1))
    return out


binary_all = prop_ranges(
    [ucd("PropList.txt"), ucd("DerivedCoreProperties.txt"), ucd("emoji", "emoji-data.txt"),
     ucd("extracted", "DerivedBinaryProperties.txt")],
    skip={p for p in SKIP_BINARY if p.startswith("Other_")} | {"InCB"},
)


def enum_values(prop_map, names=None):
    groups = defaultdict(list)
    for cp, v in prop_map.items():
        if gc[cp] != "Cn":  # assigned characters only; reserved code points just carry defaults
            groups[v].append(cp)
    return [
        {"code": v, "name": (names or {}).get(v, v).replace("_", " "), "count": len(cps), "ranges": to_ranges(cps)}
        for v, cps in sorted(groups.items(), key=lambda kv: -len(kv[1]))
    ]


decomp_type = {}
for cp, f in ud.items():
    if f[5]:
        decomp_type[cp] = f[5].split()[0].strip("<>") if f[5].startswith("<") else "canonical"
props_out = {
    "binary": [
        {"name": name.replace("_", " "), "count": len(cps), "ranges": to_ranges(cps)}
        for name, cps in sorted(binary_all.items())
    ],
    "enums": [
        {"prop": "bc", "label": "Bidi class", "values": enum_values(bidi, pva["bc"])},
        {"prop": "ea", "label": "East Asian width", "values": enum_values(eaw, pva["ea"])},
        {"prop": "lb", "label": "Line break", "values": enum_values(lb, pva["lb"])},
        {"prop": "dt", "label": "Decomposition", "values": enum_values(decomp_type)},
        {"prop": "nt", "label": "Numeric type", "values": enum_values(enum_prop(ucd("extracted", "DerivedNumericType.txt")))},
        {"prop": "jt", "label": "Joining type", "values": enum_values(enum_prop(ucd("extracted", "DerivedJoiningType.txt")), pva["jt"])},
    ],
}
with open(os.path.join(OUT, "props.json"), "w") as fh:
    json.dump(props_out, fh, separators=(",", ":"))

# ---------------------------------------------------------------------------
# names.txt: explicit names plus searchable aliases
# ---------------------------------------------------------------------------
with open(os.path.join(OUT, "names.txt"), "w", encoding="utf-8") as fh:
    for cp in sorted(set(names) | set(aliases) | set(k for k in nl if nl[k].get("="))):
        als = [a for a, _t in aliases.get(cp, [])]
        als += [a for a in nl[cp].get("=", []) if a not in als] if cp in nl else []
        name = names.get(cp, "")
        fh.write(f"{cp:X}\t{name}\t{'|'.join(als)}\n")

# ---------------------------------------------------------------------------
# detail/NN.json
# ---------------------------------------------------------------------------
detail_dir = os.path.join(OUT, "detail")
if os.path.isdir(detail_dir):
    shutil.rmtree(detail_dir)
os.makedirs(detail_dir)


def decomposition(field):
    if not field:
        return None
    parts = field.split()
    kind = None
    if parts[0].startswith("<"):
        kind = parts.pop(0).strip("<>")
    return {"type": kind or "canonical", "cps": [int(p, 16) for p in parts]}


chunks = defaultdict(dict)
for cp in range(MAX):
    if gc[cp] == "Cn" and cp not in nl:
        continue
    d = {}
    f = ud.get(cp)
    if f:
        if f[3] != "0":
            d["ccc"] = int(f[3])
        dec = decomposition(f[5])
        if dec:
            d["decomp"] = dec
        if f[8]:
            d["num"] = f[8]
        if f[9] == "Y":
            d["mirrored"] = True
        for key, idx in (("upper", 12), ("lower", 13), ("title", 14)):
            if f[idx]:
                d[key] = int(f[idx], 16)
    if cp in bidi:
        d["bidi"] = bidi[cp]
    if cp in eaw:
        d["eaw"] = eaw[cp]
    if cp in lb:
        d["lb"] = lb[cp]
    if cp in scx:
        d["scx"] = scx[cp]
    if cp in aliases:
        d["aliases"] = [[a, t] for a, t in aliases[cp]]
    if cp in subhead:
        d["section"] = subhead[cp]
    if cp in nl:
        for kind, key in (("=", "alsoKnownAs"), ("*", "notes"), ("%", "formalAlias"), ("~", "variations")):
            if nl[cp].get(kind):
                d[key] = nl[cp][kind]
        if nl[cp].get("x"):
            d["seeAlso"] = nl[cp]["x"]
    if binary.get(cp):
        d["props"] = sorted(binary[cp])
    if cp in confusable_target:
        tgt = confusable_target[cp]
        d["confusableWith"] = list(tgt)
        others = [c for c in confusable_group[tgt] if c != cp][:24]
        if others:
            d["confusables"] = others
    elif (cp,) in confusable_group:
        d["confusables"] = confusable_group[(cp,)][:24]
    if cp in unihan:
        u = dict(unihan[cp])
        for k in ("simplified", "traditional", "semantic", "zvariant"):
            if k in u:
                u[k] = variant_cps(u[k])
                if not u[k]:
                    del u[k]
        if "rs" in u:
            first = u["rs"].split()[0]
            rad, strokes = first.split(".")
            u["radical"] = {"num": rad, "char": radicals.get(rad), "extra": int(strokes)}
            del u["rs"]
        if "strokes" in u:
            u["strokes"] = int(u["strokes"].split()[0])
        d["unihan"] = u
    if cp in font_of:
        d["font"] = font_of[cp]
    chunks[cp >> 12][cp] = d

for key, chunk in chunks.items():
    with open(os.path.join(detail_dir, f"{key:02X}.json"), "w", encoding="utf-8") as fh:
        json.dump({f"{cp:X}": d for cp, d in chunk.items()}, fh, separators=(",", ":"), ensure_ascii=False)

# ---------------------------------------------------------------------------
# Fonts symlink
# ---------------------------------------------------------------------------
link = os.path.join(ROOT, "public", "fonts")
if os.path.islink(link) or os.path.exists(link):
    os.remove(link)
os.symlink(FONTS, link)

assigned = sum(1 for g in gc if g != "Cn")
print(f"Unicode {VERSION}: {len(blocks)} blocks, {assigned} assigned code points")
print(f"Fonts: {len(cps_by_font)} faces used; {coverage['uncoveredTotal']} of {coverage['drawableTotal']} "
      f"drawable code points have no glyph in any font (see public/data/coverage.json)")
pixel = Counter(blocks[block_of[cp]]["name"] for cp, fid in font_of.items() if fonts[fid]["tier"] == PIXEL_TIER)
print(f"Unifont pixel fallback draws {sum(pixel.values())}: " + ", ".join(f"{n} {c}" for n, c in pixel.most_common(8)))
by_font = Counter(fonts[fid]["family"] for fid in font_of.values() if fonts[fid]["tier"] == 5)
print("Gap-filler fonts draw: " + ", ".join(f"{n} {c}" for n, c in by_font.most_common()))
print("Still uncovered:")
for row in coverage["byBlock"][:15]:
    print(f"  {row['uncovered']:6d} / {row['assigned']:6d}  {row['block']}")
