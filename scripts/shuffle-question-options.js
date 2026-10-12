/**
 * Randomises option order for every seeded question.
 *
 * The generated seed content placed the correct answer at option "A" ~95% of
 * the time, which made every quiz trivially gameable (answer "A" to everything
 * and score ~100%). This shuffles each question's options, re-letters them
 * A-D, remaps `correctAnswers`, and rewrites option-letter references inside
 * `explanation` so the prose still points at the right option.
 *
 * Usage:
 *   node scripts/shuffle-question-options.js <seed-data-dir> [--dry]
 */
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2];
const DRY = process.argv.includes("--dry");
if (!DIR) {
  console.error(
    "usage: node scripts/shuffle-question-options.js <seed-data-dir> [--dry]",
  );
  process.exit(1);
}

const KEYS = ["A", "B", "C", "D"];

// Deterministic RNG (mulberry32) so re-runs produce identical output.
const makeRng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * Rewrites standalone option letters in `text` using `map` (oldKey -> newKey).
 * Deliberately conservative: leaves letters alone when they're part of a
 * technical term rather than an option reference (W3C, B-tree, C++, A/B).
 */
const remapLetters = (text, map) => {
  if (!text) return text;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!KEYS.includes(ch)) {
      out += ch;
      continue;
    }
    const prev = text[i - 1] ?? "";
    const next = text[i + 1] ?? "";
    const next2 = text[i + 2] ?? "";

    const prevBlocks = /[A-Za-z0-9/+.]/.test(prev);
    const nextBlocks = /[A-Za-z0-9/+]/.test(next);
    // "D-ও ভুল" is an option reference; "B-tree" is not.
    const hyphenIntoLatin = next === "-" && /[A-Za-z]/.test(next2);

    out +=
      prevBlocks || nextBlocks || hyphenIntoLatin ? ch : (map[ch] ?? ch);
  }
  return out;
};

const shuffleQuestion = (q, seedSource) => {
  const rng = makeRng(hash(seedSource));

  const opts = [...q.options];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }

  // oldKey -> newKey, based on the shuffled position.
  const map = {};
  opts.forEach((opt, i) => {
    map[opt.key] = KEYS[i];
  });

  return {
    ...q,
    options: opts.map((opt, i) => ({ key: KEYS[i], text: opt.text })),
    correctAnswers: q.correctAnswers
      .map((k) => map[k])
      .sort((a, b) => KEYS.indexOf(a) - KEYS.indexOf(b)),
    explanation: remapLetters(q.explanation, map),
  };
};

let files = 0;
let questions = 0;
const before = { A: 0, B: 0, C: 0, D: 0 };
const after = { A: 0, B: 0, C: 0, D: 0 };

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const full = path.join(DIR, file);
  const data = JSON.parse(fs.readFileSync(full, "utf-8"));

  const updated = data.map((q, idx) => {
    if (q.questionType === "SINGLE") before[q.correctAnswers[0]]++;
    const next = shuffleQuestion(q, `${file}:${idx}:${q.questionText}`);
    if (next.questionType === "SINGLE") after[next.correctAnswers[0]]++;
    questions++;
    return next;
  });

  if (!DRY) fs.writeFileSync(full, JSON.stringify(updated, null, 2) + "\n");
  files++;
}

const pct = (obj, total) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, Math.round((v / total) * 100) + "%"]),
  );
const totalSingle = Object.values(before).reduce((a, b) => a + b, 0);

console.log(
  `${DRY ? "[dry run] " : ""}files: ${files}, questions: ${questions}`,
);
console.log("SINGLE correct-key BEFORE:", before, pct(before, totalSingle));
console.log("SINGLE correct-key AFTER :", after, pct(after, totalSingle));

module.exports = { shuffleQuestion, remapLetters };
