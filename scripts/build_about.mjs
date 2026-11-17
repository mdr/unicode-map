// Fetches short descriptions of Unicode scripts and blocks from English Wikipedia into
// src/data/about.json, which is committed: builds and CI never contact Wikipedia. Re-run it after
// a Unicode upgrade, or now and then for fresher text, and review the diff:
//
//   pnpm about              # uses cached responses where it has them (.cache/about)
//   pnpm about --refresh    # fetches everything again
//
// Scripts are matched to articles through Wikidata (ISO 15924 code → item → English article);
// blocks through their "<Block name> (Unicode block)" articles, where there is one. Wikipedia's
// text is CC BY-SA 4.0; the app credits it and links each article.
// Run after `pnpm data` (it reads the script and block lists from public/data/meta.json).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UA = "unicode-map-about/1.0";
const CACHE = ".cache/about";
const OUT = "src/data/about.json";
const CHARS_OUT = "src/data/about-chars.json";
const refresh = process.argv.includes("--refresh");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET a JSON URL, from the cache if we have it; backs off and retries when rate limited. */
async function getJson(url) {
  const file = join(CACHE, createHash("sha1").update(url).digest("hex") + ".json");
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      const wait = Number(r.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
      console.warn(`  ${r.status}; waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} for ${url}`);
    const json = await r.json();
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(json));
    await sleep(200); // be gentle
    return json;
  }
}

/** Intro text, short description and canonical title for up to 20 titles at a time. */
async function intros(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1" +
      "&prop=extracts|description&exintro=1&explaintext=1&exlimit=20&titles=" +
      encodeURIComponent(batch.join("|"));
    const q = (await getJson(url)).query;
    // Follow normalisation and redirects back to the titles we asked for.
    const final = new Map(batch.map((t) => [t, t]));
    for (const n of q.normalized ?? []) for (const [k, v] of final) if (v === n.from) final.set(k, n.to);
    for (const rd of q.redirects ?? []) for (const [k, v] of final) if (v === rd.from) final.set(k, rd.to);
    const pages = new Map(q.pages.filter((p) => !p.missing).map((p) => [p.title, p]));
    for (const [asked, title] of final) {
      const p = pages.get(title);
      if (p?.extract) out.set(asked, { title: p.title, description: p.description, extract: p.extract });
    }
  }
  return out;
}

/** The first paragraph, cut at a sentence end if it's long. */
function trim(text) {
  let t = text.split("\n").find((l) => l.trim()) ?? "";
  t = t.replace(/\s+/g, " ").trim();
  if (t.length <= 700) return t;
  const cut = t.slice(0, 700);
  const end = cut.lastIndexOf(". ");
  return end > 200 ? cut.slice(0, end + 1) : cut + "…";
}

const entry = (p) => ({
  title: p.title,
  url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")),
  ...(p.description ? { description: p.description } : {}),
  extract: trim(p.extract),
});

const meta = JSON.parse(readFileSync("public/data/meta.json", "utf8"));

// --- Scripts, via Wikidata --------------------------------------------------------------------
const sparql = `SELECT ?code ?article WHERE {
  ?item wdt:P506 ?code .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}`;
const wd = await getJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql));
const candidates = new Map();
for (const b of wd.results.bindings) {
  const code = b.code.value;
  const title = decodeURIComponent(b.article.value.replace("https://en.wikipedia.org/wiki/", "")).replace(/_/g, " ");
  if (!candidates.has(code)) candidates.set(code, []);
  candidates.get(code).push(title);
}
// Several items can share a code (a script and a variant of it); prefer the article named after
// the script, then one that's about a writing system.
const words = /\b(script|alphabet|abjad|abugida|syllabary|writing|characters|hieroglyphs|numerals|symbols|notation)\b/i;
const scriptTitles = new Map();
for (const s of meta.scripts) {
  const titles = candidates.get(s.code) ?? [];
  const score = (t) => (t.toLowerCase().startsWith(s.name.toLowerCase()) ? 2 : 0) + (words.test(t) ? 1 : 0) - t.length / 1000;
  const best = [...titles].sort((a, b) => score(b) - score(a))[0];
  if (best) scriptTitles.set(s.code, best);
  if (titles.length > 1) console.log(`  ${s.code}: chose "${best}" from ${titles.map((t) => `"${t}"`).join(", ")}`);
}
// A few scripts' Wikidata items have no English article linked: try the usual titles.
const PSEUDO = new Set(["Zyyy", "Zinh", "Zzzz"]); // Common, Inherited, Unknown: not writing systems
const unlinked = meta.scripts.filter((s) => !scriptTitles.has(s.code) && !PSEUDO.has(s.code));
const guesses = unlinked.flatMap((s) => [`${s.name} alphabet`, `${s.name} script`]);
const guessed = await intros(guesses);
for (const s of unlinked) {
  const hit = [`${s.name} alphabet`, `${s.name} script`].find((t) => guessed.has(t));
  if (hit) scriptTitles.set(s.code, guessed.get(hit).title);
}
const scriptIntros = await intros([...new Set(scriptTitles.values())]);
const scripts = {};
for (const [code, title] of scriptTitles) {
  const p = scriptIntros.get(title);
  if (p) scripts[code] = entry(p);
}
const noScript = meta.scripts.filter((s) => !scripts[s.code]).map((s) => s.code);
console.log(`Scripts: ${Object.keys(scripts).length} of ${meta.scripts.length}` + (noScript.length ? ` (none for ${noScript.join(", ")})` : ""));

// --- Blocks, via their "(Unicode block)" articles ----------------------------------------------
const blockIntros = await intros(meta.blocks.map((b) => `${b.name} (Unicode block)`));
const blocks = {};
for (const b of meta.blocks) {
  const p = blockIntros.get(`${b.name} (Unicode block)`);
  // A redirect can land on a general article; keep only ones about the block.
  if (p && /unicode block/i.test(p.extract.slice(0, 400))) blocks[b.name] = entry(p);
}
console.log(`Blocks: ${Object.keys(blocks).length} of ${meta.blocks.length}`);

// --- Characters with an article of their own --------------------------------------------------
// Wikidata links characters to articles through "Unicode hex codepoint" (P4213) and "Unicode
// character" (P487). Many of those links are to the thing a character depicts (🦦 → Otter) or
// redirect to a general article shared by many characters (⊺ → Transpose); keep only articles
// that read as being about a character, and that no more than a few characters share.
const charSparql = `SELECT ?cp ?char ?article WHERE {
  { ?item wdt:P4213 ?cp } UNION { ?item wdt:P487 ?char }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}`;
const wdc = await getJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(charSparql));
const titlesByCp = new Map();
for (const b of wdc.results.bindings) {
  let cp;
  if (b.cp) cp = parseInt(b.cp.value.replace(/^U\+/i, ""), 16);
  else if ([...b.char.value].length === 1) cp = b.char.value.codePointAt(0);
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) continue;
  const title = decodeURIComponent(b.article.value.replace("https://en.wikipedia.org/wiki/", "")).replace(/_/g, " ");
  if (!titlesByCp.has(cp)) titlesByCp.set(cp, new Set());
  titlesByCp.get(cp).add(title);
}
const charIntros = await intros([...new Set([...titlesByCp.values()].flatMap((t) => [...t]))]);
// What a character article says it is, in its short description or first sentence.
const CHARACTER_WORDS =
  /\b(letters?|symbols?|signs?|characters?|glyphs?|diacritics?|diacritical|punctuation|marks?|kana|radicals?|emoji|numerals?|ligatures?|digraphs?|logograms?|hieroglyphs?|cuneiform|braille|accents?|typographic|graphemes?|syllables?|syllabograms?|runes?|vowel points?|niqqud|ideographs?|hanzi|kanji|codepoints?|unicode|alphabet|abjad|abugida)\b/i;
// A short description naming something else that a character stands for, not the character.
const NOT_CHARACTER = /\b(chemical element|flags?|used as a symbol|natural number|integer|set theory|chess piece|card|block)\b/i;
// Without a short description, the first sentence has to say plainly that it's a character.
const IS_A_CHARACTER =
  /\b(is|was) (a|an|the)\b[^.]{0,80}\b(letter|character|symbol|sign|glyph|diacritic|punctuation mark|ligature|digraph|numeral|kana|radical|emoji|rune|hieroglyph)\b/i;
const isAboutCharacter = (p) =>
  p.description
    ? CHARACTER_WORDS.test(p.description) && !NOT_CHARACTER.test(p.description)
    : IS_A_CHARACTER.test(trim(p.extract).split(/(?<=\.)\s/)[0]);
// Wikidata has the odd wrong link (the item for the Cyrillic letter ӆ also lists a Latin "A").
// When an article's description names a script, the character's name must mention it too.
const charNames = new Map(
  readFileSync("public/data/names.txt", "utf8")
    .split("\n")
    .map((l) => l.split("\t"))
    // code point, name, aliases (controls have only aliases)
    .map(([h, name, aliases]) => [parseInt(h, 16), name || (aliases ?? "").split("|")[0]]),
);
const scriptWords = meta.scripts
  .map((sc) => sc.name)
  .filter((n) => n.length >= 4 && !["Common", "Inherited", "Unknown"].includes(n));
const sameScript = (cp, p) => {
  const name = charNames.get(cp);
  if (!name) return true;
  const named = scriptWords.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(p.description ?? ""));
  return !named.length || named.some((w) => name.includes(w.toUpperCase()));
};
const blockAndScriptUrls = new Set([...Object.values(scripts), ...Object.values(blocks)].map((a) => a.url));
const candidates2 = new Map();
const uses = new Map();
for (const [cp, titles] of titlesByCp) {
  for (const t of titles) {
    const p = charIntros.get(t);
    if (!p) continue;
    candidates2.set(cp, [...(candidates2.get(cp) ?? []), p]);
    uses.set(p.title, (uses.get(p.title) ?? new Set()).add(cp));
  }
}
const chars = {};
const dropped = [];
for (const [cp, pages] of [...candidates2].sort((a, b) => a[0] - b[0])) {
  // A letter's article is shared by its variants (hiragana and katakana, fullwidth, maths
  // styles); one shared much more widely is about something general.
  // Shared more widely than that, it goes to the first of them: the plain letter, not 𝐈 or ı.
  const ok = pages.filter(
    (p) =>
      (uses.get(p.title).size <= 12 || Math.min(...uses.get(p.title)) === cp) &&
      !blockAndScriptUrls.has(entry(p).url) &&
      isAboutCharacter(p) &&
      sameScript(cp, p),
  );
  const key = cp.toString(16).toUpperCase().padStart(4, "0");
  // With several, the one more characters share is the canonical article (A → "A", not a stray
  // link to a Cyrillic letter).
  if (ok.length) chars[key] = entry(ok.sort((a, b) => uses.get(b.title).size - uses.get(a.title).size)[0]);
  else dropped.push(`${key} ${pages.map((p) => `${p.title} (${p.description ?? "-"}; ${uses.get(p.title).size})`).join(" | ")}`);
}
console.log(`Characters: ${Object.keys(chars).length} with an article of their own, of ${candidates2.size} linked`);
if (process.argv.includes("--report")) {
  writeFileSync(".cache/about/chars-kept.txt", Object.entries(chars).map(([k, a]) => `${k} ${a.title} (${a.description ?? "-"})`).join("\n"));
  writeFileSync(".cache/about/chars-dropped.txt", dropped.join("\n"));
}
writeFileSync(
  CHARS_OUT,
  JSON.stringify({ source: "English Wikipedia, CC BY-SA 4.0", fetched: new Date().toISOString().slice(0, 10), chars }) + "\n",
);
console.log(`Wrote ${CHARS_OUT}`);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "English Wikipedia, CC BY-SA 4.0",
      fetched: new Date().toISOString().slice(0, 10),
      scripts,
      blocks,
    },
    null,
    1,
  ) + "\n",
);
console.log(`Wrote ${OUT}`);
