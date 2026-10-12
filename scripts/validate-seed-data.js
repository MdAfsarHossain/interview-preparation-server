/**
 * Validates every seed-data question file against the shape the seeder and the
 * exam engine rely on.
 *
 * Usage:
 *   node scripts/validate-seed-data.js <seed-data-dir> [--fix]
 *
 * With --fix, repairs the one class of defect that is unambiguously safe to
 * auto-correct: a question labelled SINGLE that actually carries 2-3 correct
 * answers AND whose text already tells the user to expect several, which is a
 * mislabelled MULTIPLE.
 */
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2];
const FIX = process.argv.includes("--fix");
if (!DIR) {
  console.error("usage: node scripts/validate-seed-data.js <dir> [--fix]");
  process.exit(1);
}

const KEYS = ["A", "B", "C", "D"];
const MULTI_HINT = /একাধিক উত্তর/;

let totalQuestions = 0;
let totalFixed = 0;
let totalSingle = 0;
let totalLongestCorrect = 0;
let totalShortestCorrect = 0;
let totalLongestMargin = 0;
let totalShortestMargin = 0;
const problems = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const full = path.join(DIR, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, "utf-8"));
  } catch (error) {
    problems.push(`${file}: UNPARSEABLE JSON — ${error.message}`);
    continue;
  }

  if (!Array.isArray(data)) {
    problems.push(`${file}: top level is not an array`);
    continue;
  }
  if (data.length !== 100) {
    problems.push(`${file}: has ${data.length} questions, expected 100`);
  }

  const seenText = new Map();
  const difficulties = { EASY: 0, MEDIUM: 0, HARD: 0 };
  const singleKeys = { A: 0, B: 0, C: 0, D: 0 };
  let fixedHere = 0;
  // "Longest option is the correct one" is a giveaway a test-taker can exploit
  // without knowing the material; at chance it should sit near 25%.
  let singleCount = 0;
  let longestIsCorrect = 0;
  let shortestIsCorrect = 0;
  let longestByMargin = 0;
  let shortestByMargin = 0;

  data.forEach((q, i) => {
    totalQuestions++;
    const at = `${file}[${i}]`;

    if (!["EASY", "MEDIUM", "HARD"].includes(q.difficulty)) {
      problems.push(`${at}: bad difficulty ${JSON.stringify(q.difficulty)}`);
    } else {
      difficulties[q.difficulty]++;
    }

    if (!q.questionText || typeof q.questionText !== "string") {
      problems.push(`${at}: missing questionText`);
    } else if (seenText.has(q.questionText)) {
      problems.push(`${at}: duplicate questionText (first at ${seenText.get(q.questionText)})`);
    } else {
      seenText.set(q.questionText, i);
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      problems.push(`${at}: expected 4 options, got ${q.options?.length}`);
      return;
    }
    q.options.forEach((opt, j) => {
      if (opt.key !== KEYS[j]) {
        problems.push(`${at}: option ${j} key is ${JSON.stringify(opt.key)}, expected ${KEYS[j]}`);
      }
      // Short options are legitimate when the answer *is* a code token
      // (`opacity`, `::after`, `never`), so only flag empty/near-empty text.
      if (!opt.text || typeof opt.text !== "string" || opt.text.trim().length < 3) {
        problems.push(`${at}: option ${opt.key} text missing or too short`);
      }
    });

    if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
      problems.push(`${at}: missing correctAnswers`);
      return;
    }
    const unknown = q.correctAnswers.filter(
      (k) => !q.options.some((o) => o.key === k),
    );
    if (unknown.length) {
      problems.push(`${at}: correctAnswers reference unknown keys ${JSON.stringify(unknown)}`);
    }
    if (new Set(q.correctAnswers).size !== q.correctAnswers.length) {
      problems.push(`${at}: correctAnswers has duplicates`);
    }
    if (q.correctAnswers.length === 4) {
      problems.push(`${at}: all 4 options marked correct (not a usable question)`);
    }

    // Type / cardinality agreement.
    if (q.questionType === "SINGLE" && q.correctAnswers.length > 1) {
      if (FIX && q.correctAnswers.length <= 3 && MULTI_HINT.test(q.questionText)) {
        q.questionType = "MULTIPLE";
        fixedHere++;
        totalFixed++;
      } else {
        problems.push(
          `${at}: SINGLE but has ${q.correctAnswers.length} correct answers`,
        );
      }
    } else if (
      q.questionType === "MULTIPLE" &&
      (q.correctAnswers.length < 2 || q.correctAnswers.length > 3)
    ) {
      problems.push(
        `${at}: MULTIPLE but has ${q.correctAnswers.length} correct answers`,
      );
    } else if (!["SINGLE", "MULTIPLE"].includes(q.questionType)) {
      problems.push(`${at}: bad questionType ${JSON.stringify(q.questionType)}`);
    }

    if (q.questionType === "SINGLE") {
      singleKeys[q.correctAnswers[0]]++;
      singleCount++;
      const lengths = q.options.map((o) => (o.text || "").length);
      const correctIdx = q.options.findIndex(
        (o) => o.key === q.correctAnswers[0],
      );
      if (correctIdx >= 0) {
        const others = lengths.filter((_, j) => j !== correctIdx);
        if (lengths[correctIdx] === Math.max(...lengths)) {
          longestIsCorrect++;
          // Only a clear margin is actually exploitable — being longest by a
          // character or two is invisible to a reader.
          if (lengths[correctIdx] > Math.max(...others) * 1.25) {
            longestByMargin++;
          }
        }
        // The inverse is just as exploitable: a conspicuously *short* correct
        // answer beside three padded distractors also gives the game away.
        if (lengths[correctIdx] === Math.min(...lengths)) {
          shortestIsCorrect++;
          if (lengths[correctIdx] * 1.25 < Math.min(...others)) {
            shortestByMargin++;
          }
        }
      }
    }

    if (!q.explanation || q.explanation.trim().length < 20) {
      problems.push(`${at}: explanation missing or too short`);
    }
  });

  if (FIX && fixedHere > 0) {
    fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n");
  }

  const total = Object.values(singleKeys).reduce((a, b) => a + b, 0) || 1;
  const posSkew = Math.round((Math.max(...Object.values(singleKeys)) / total) * 100);
  const lenSkew = singleCount
    ? Math.round((longestByMargin / singleCount) * 100)
    : 0;
  const shortSkew = singleCount
    ? Math.round((shortestByMargin / singleCount) * 100)
    : 0;
  const flags = [
    posSkew > 40 ? `⚠️ position-skew ${posSkew}%` : null,
    lenSkew > 25 ? `⚠️ longest-is-correct ${lenSkew}%` : null,
    shortSkew > 25 ? `⚠️ shortest-is-correct ${shortSkew}%` : null,
  ]
    .filter(Boolean)
    .join(" ");

  totalSingle += singleCount;
  totalLongestCorrect += longestIsCorrect;
  totalShortestCorrect += shortestIsCorrect;
  totalLongestMargin += longestByMargin;
  totalShortestMargin += shortestByMargin;

  console.log(
    `${file.padEnd(20)} n=${String(data.length).padEnd(4)} ` +
      `E/M/H=${difficulties.EASY}/${difficulties.MEDIUM}/${difficulties.HARD} ` +
      `keys=${JSON.stringify(singleKeys)}${fixedHere ? ` fixed=${fixedHere}` : ""} ${flags}`,
  );
}

const overallLenSkew = totalSingle ? Math.round((totalLongestCorrect / totalSingle) * 100) : 0;
console.log(`\nquestions checked: ${totalQuestions}`);
console.log(`SINGLE questions (chance baseline for each figure below: 25%)`);
console.log(`  longest option is correct, by a >25% margin (exploitable): ${totalLongestMargin}/${totalSingle} (${totalSingle ? Math.round((totalLongestMargin / totalSingle) * 100) : 0}%)`);
console.log(`  longest option is correct, by any margin:                  ${totalLongestCorrect}/${totalSingle} (${overallLenSkew}%)`);
const overallShortSkew = totalSingle ? Math.round((totalShortestCorrect / totalSingle) * 100) : 0;
console.log(`  shortest option is correct, by a >25% margin:              ${totalShortestMargin}/${totalSingle} (${totalSingle ? Math.round((totalShortestMargin / totalSingle) * 100) : 0}%)`);
console.log(`  shortest option is correct, by any margin:                 ${totalShortestCorrect}/${totalSingle} (${overallShortSkew}%)`);
if (FIX) console.log(`auto-fixed mislabelled SINGLE→MULTIPLE: ${totalFixed}`);
console.log(`problems: ${problems.length}`);
problems.slice(0, 40).forEach((p) => console.log("  " + p));
if (problems.length > 40) console.log(`  ...and ${problems.length - 40} more`);
process.exitCode = problems.length ? 1 : 0;
