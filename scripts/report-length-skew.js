/**
 * Reports, per file, which SINGLE questions have the "longest option is the
 * correct one" tell, and how lopsided each one is.
 *
 * Usage: node scripts/report-length-skew.js <seed-data-dir> [file.json]
 */
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2];
const ONLY = process.argv[3];
if (!DIR) {
  console.error("usage: node scripts/report-length-skew.js <dir> [file.json]");
  process.exit(1);
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !ONLY || f === ONLY);

let grandTotal = 0;
let grandTell = 0;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf-8"));
  const offenders = [];
  let singles = 0;

  data.forEach((q, i) => {
    if (q.questionType !== "SINGLE" || !q.options || q.options.length !== 4) return;
    singles++;
    const lens = q.options.map((o) => (o.text || "").length);
    const ci = q.options.findIndex((o) => o.key === q.correctAnswers[0]);
    if (ci < 0) return;
    const others = lens.filter((_, j) => j !== ci);
    const maxOther = Math.max(...others);
    // Flag when the correct option is the longest AND meaningfully longer.
    if (lens[ci] === Math.max(...lens) && lens[ci] > maxOther * 1.25) {
      offenders.push({ i, correct: lens[ci], maxOther });
    }
  });

  grandTotal += singles;
  grandTell += offenders.length;
  console.log(
    `${file.padEnd(20)} singles=${String(singles).padEnd(4)} needs-fix=${String(offenders.length).padEnd(4)} ` +
      `(${singles ? Math.round((offenders.length / singles) * 100) : 0}%)`,
  );
  if (ONLY) {
    console.log("  indices: " + offenders.map((o) => o.i).join(","));
  }
}

console.log(
  `\nTOTAL singles=${grandTotal} needs-fix=${grandTell} (${grandTotal ? Math.round((grandTell / grandTotal) * 100) : 0}%)`,
);
