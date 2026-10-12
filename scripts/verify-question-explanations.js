/**
 * Sanity-checks that option-letter references inside `explanation` agree with
 * `correctAnswers`.
 *
 * Looks for Bangla phrases of the form "<LETTER> ভুল" (wrong) and
 * "<LETTER> সঠিক" (correct) and asserts the letter's membership in
 * `correctAnswers` matches. Used to confirm the option shuffle didn't
 * desynchronise the prose from the answer key.
 *
 * Usage: node scripts/verify-question-explanations.js <seed-data-dir>
 */
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2];
if (!DIR) {
  console.error("usage: node scripts/verify-question-explanations.js <dir>");
  process.exit(1);
}

// A letter reference, then optional Bangla particles/punctuation, then a verdict.
// Note: Bangla negates *after* the adjective ("সঠিক নয়" = "is not correct"),
// so a "সঠিক" hit followed by নয়/না is really a wrong-answer assertion.
const WRONG = /(?:^|[^A-Za-z0-9/+.])([ABCD])(?:-ও|-এ|-তে)?\s*(?:\)|,|—|-)?\s*ভুল/g;
// "সঠিক হতো/হত" is a counterfactual ("would have been correct"), not a claim
// about this question's answer, so it must not count as a RIGHT assertion.
// Also skip "সঠিক ফল/ফলাফল/আউটপুট/মান" — that says the option produces a
// correct *result*, not that it is the answer to this question.
const RIGHT = /(?:^|[^A-Za-z0-9/+.])([ABCD])(?:-ও|-এ|-তে)?\s*(?:\)|,|—|-)?\s*সঠিক(?!\s*(?:ফল|ফলাফল|আউটপুট|মান))(?![^।]{0,30}?(?:নয়|না\b|পড়ে না|হতো|হত\b))/g;
const NOT_RIGHT = /(?:^|[^A-Za-z0-9/+.])([ABCD])(?:-ও|-এ|-তে)?\s*(?:\)|,|—|-)?\s*সঠিক[^।]{0,30}?(?:নয়|না\b|পড়ে না)/g;

let checked = 0;
let wrongRefs = 0;
let rightRefs = 0;
const violations = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf-8"));

  data.forEach((q, idx) => {
    const exp = q.explanation || "";
    const correct = new Set(q.correctAnswers);
    checked++;

    for (const m of exp.matchAll(WRONG)) {
      wrongRefs++;
      if (correct.has(m[1])) {
        violations.push(
          `${file}[${idx}] says "${m[1]} ভুল" but ${m[1]} IS in correctAnswers ${JSON.stringify(q.correctAnswers)}`,
        );
      }
    }
    for (const m of exp.matchAll(RIGHT)) {
      rightRefs++;
      if (!correct.has(m[1])) {
        violations.push(
          `${file}[${idx}] says "${m[1]} সঠিক" but ${m[1]} is NOT in correctAnswers ${JSON.stringify(q.correctAnswers)}`,
        );
      }
    }
    for (const m of exp.matchAll(NOT_RIGHT)) {
      wrongRefs++;
      if (correct.has(m[1])) {
        violations.push(
          `${file}[${idx}] says "${m[1]} সঠিক নয়" but ${m[1]} IS in correctAnswers ${JSON.stringify(q.correctAnswers)}`,
        );
      }
    }
  });
}

console.log(`questions checked: ${checked}`);
console.log(`"X ভুল" references: ${wrongRefs}, "X সঠিক" references: ${rightRefs}`);
console.log(`violations: ${violations.length}`);
violations.slice(0, 15).forEach((v) => console.log("  " + v));
if (violations.length > 15) {
  console.log(`  ...and ${violations.length - 15} more`);
}
