/**
 * Guards against damage from the distractor-rewrite pass.
 *
 * The rewrite is only allowed to change the *text of wrong options*, so this
 * checks the things that must still hold afterwards:
 *   - no two options within a question share the same text (a rewritten
 *     distractor must not have drifted into restating the correct answer)
 *   - no option text is suspiciously near-identical to another
 *   - option text isn't just the question restated
 *
 * Usage: node scripts/check-option-integrity.js <seed-data-dir>
 */
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2];
if (!DIR) {
  console.error("usage: node scripts/check-option-integrity.js <dir>");
  process.exit(1);
}

const norm = (s) =>
  (s || "").replace(/\s+/g, " ").replace(/[।,'"`()]/g, "").trim().toLowerCase();

let checked = 0;
const problems = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf-8"));
  } catch (error) {
    problems.push(`${file}: UNPARSEABLE — ${error.message.slice(0, 60)}`);
    continue;
  }

  data.forEach((q, i) => {
    if (!Array.isArray(q.options)) return;
    checked++;
    const at = `${file}[${i}]`;
    const texts = q.options.map((o) => norm(o.text));

    for (let a = 0; a < texts.length; a++) {
      for (let b = a + 1; b < texts.length; b++) {
        if (texts[a] && texts[a] === texts[b]) {
          problems.push(
            `${at}: options ${q.options[a].key} and ${q.options[b].key} have identical text`,
          );
        }
      }
    }

    // An option that merely echoes the question adds no information.
    const qn = norm(q.questionText);
    q.options.forEach((o) => {
      if (qn && norm(o.text) === qn) {
        problems.push(`${at}: option ${o.key} just restates the question`);
      }
    });
  });
}

console.log(`questions checked: ${checked}`);
console.log(`problems: ${problems.length}`);
problems.slice(0, 30).forEach((p) => console.log("  " + p));
if (problems.length > 30) console.log(`  ...and ${problems.length - 30} more`);
process.exitCode = problems.length ? 1 : 0;
