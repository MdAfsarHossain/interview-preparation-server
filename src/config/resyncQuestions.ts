import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { closeDatabase } from "./database";
import { query } from "../app/utils/db";
import slugify from "../app/utils/slugify";

dotenv.config();

const SEED_DATA_DIR = path.join(__dirname, "../app/modules/question/seed-data");

/**
 * Re-syncs options / correct_answers / explanation for questions already in the
 * database, matching on (category, question_text).
 *
 * Needed after re-shuffling option order in the seed files: the question text is
 * unchanged, so it's a stable join key, but the stored answer key is stale.
 */
const runResync = async () => {
  console.log("🔄 Re-syncing question options from seed files...");

  const files = fs
    .readdirSync(SEED_DATA_DIR)
    .filter((file) => file.endsWith(".json"));

  let totalUpdated = 0;
  let totalMissing = 0;

  for (const file of files) {
    const slug = slugify(file.replace(/\.json$/, ""));

    const categoryResult = await query(
      `SELECT id, name FROM categories WHERE slug = $1`,
      [slug],
    );

    if (categoryResult.rows.length === 0) {
      console.log(`⏭️  ${slug}: category not in database yet, skipping`);
      continue;
    }

    const category = categoryResult.rows[0];
    const questions = JSON.parse(
      fs.readFileSync(path.join(SEED_DATA_DIR, file), "utf-8"),
    );

    // One multi-row UPDATE ... FROM instead of one query per question — the
    // remote database makes per-row round-trips far too slow.
    const values: any[] = [];
    const tuples = questions.map((q: any, i: number) => {
      const base = i * 4;
      values.push(
        q.questionText,
        JSON.stringify(q.options),
        q.correctAnswers,
        q.explanation || null,
      );
      return `($${base + 1}, $${base + 2}::jsonb, $${base + 3}::text[], $${base + 4})`;
    });
    values.push(category.id);

    const result = await query(
      `
          UPDATE questions q
          SET options = v.options,
              correct_answers = v.correct_answers,
              explanation = v.explanation,
              "updatedAt" = CURRENT_TIMESTAMP
          FROM (VALUES ${tuples.join(", ")})
               AS v(question_text, options, correct_answers, explanation)
          WHERE q.category_id = $${values.length}::uuid
            AND q.question_text = v.question_text
          RETURNING q.id
      `,
      values,
    );

    const updated = result.rows.length;
    const missing = questions.length - updated;

    totalUpdated += updated;
    totalMissing += missing;
    console.log(
      `✅ ${category.name}: ${updated} updated, ${missing} not found in database`,
    );
  }

  console.log(
    `🎉 Re-sync completed: ${totalUpdated} updated, ${totalMissing} not found.`,
  );
};

runResync()
  .catch((error) => {
    console.error("❌ Question re-sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
