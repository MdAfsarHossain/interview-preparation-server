import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { closeDatabase } from "./database";
import { query } from "../app/utils/db";
import { QuestionService } from "../app/modules/question/question.service";
import slugify from "../app/utils/slugify";

dotenv.config();

const SEED_DATA_DIR = path.join(
  __dirname,
  "../app/modules/question/seed-data",
);

// Known display names / descriptions for category slugs; falls back to a
// capitalized version of the slug for any category not listed here.
const CATEGORY_META: Record<string, { name: string; description: string }> = {
  javascript: { name: "JavaScript", description: "JavaScript ভাষার ইন্টারভিউ প্রশ্ন" },
  react: { name: "React", description: "React.js ইন্টারভিউ প্রশ্ন" },
  postgresql: { name: "PostgreSQL", description: "PostgreSQL ডেটাবেজ ইন্টারভিউ প্রশ্ন" },
  html: { name: "HTML", description: "HTML ইন্টারভিউ প্রশ্ন" },
  css: { name: "CSS", description: "CSS ইন্টারভিউ প্রশ্ন" },
  typescript: { name: "TypeScript", description: "TypeScript ইন্টারভিউ প্রশ্ন" },
  "tailwind-css": { name: "Tailwind CSS", description: "Tailwind CSS ইন্টারভিউ প্রশ্ন" },
  "next-js": { name: "Next.js", description: "Next.js ইন্টারভিউ প্রশ্ন" },
  "node-js": { name: "Node.js", description: "Node.js ইন্টারভিউ প্রশ্ন" },
  "express-js": { name: "Express.js", description: "Express.js ইন্টারভিউ প্রশ্ন" },
  "nest-js": { name: "NestJS", description: "NestJS ইন্টারভিউ প্রশ্ন" },
  sql: { name: "SQL", description: "SQL ইন্টারভিউ প্রশ্ন" },
  mysql: { name: "MySQL", description: "MySQL ইন্টারভিউ প্রশ্ন" },
  mongodb: { name: "MongoDB", description: "MongoDB ইন্টারভিউ প্রশ্ন" },
  mongoose: { name: "Mongoose", description: "Mongoose ODM ইন্টারভিউ প্রশ্ন" },
  oop: { name: "OOP", description: "Object-Oriented Programming ইন্টারভিউ প্রশ্ন" },
  "data-structure": { name: "Data Structure", description: "ডেটা স্ট্রাকচার ইন্টারভিউ প্রশ্ন" },
  algorithm: { name: "Algorithm", description: "অ্যালগরিদম ইন্টারভিউ প্রশ্ন" },
  "system-design": { name: "System Design", description: "সিস্টেম ডিজাইন ইন্টারভিউ প্রশ্ন" },
  devops: { name: "DevOps", description: "DevOps ইন্টারভিউ প্রশ্ন" },
  aws: { name: "AWS", description: "AWS ইন্টারভিউ প্রশ্ন" },
  vps: { name: "VPS", description: "VPS ইন্টারভিউ প্রশ্ন" },
  hosting: { name: "Hosting", description: "ওয়েব হোস্টিং ইন্টারভিউ প্রশ্ন" },
  deployment: { name: "Deployment", description: "ডিপ্লয়মেন্ট ইন্টারভিউ প্রশ্ন" },
};

const getOrCreateCategory = async (slug: string) => {
  const existing = await query(`SELECT id, name FROM categories WHERE slug = $1`, [
    slug,
  ]);

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const meta = CATEGORY_META[slug] || {
    name: slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    description: null,
  };

  const result = await query(
    `
        INSERT INTO categories (name, slug, description, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, name
    `,
    [meta.name, slug, meta.description],
  );

  return result.rows[0];
};

const runSeed = async () => {
  console.log("🚀 Starting question seed...");

  if (!fs.existsSync(SEED_DATA_DIR)) {
    console.log("No seed-data directory found, nothing to seed.");
    return;
  }

  const files = fs
    .readdirSync(SEED_DATA_DIR)
    .filter((file) => file.endsWith(".json"));

  if (files.length === 0) {
    console.log("No seed JSON files found.");
    return;
  }

  for (const file of files) {
    const slug = slugify(file.replace(/\.json$/, ""));
    const filePath = path.join(SEED_DATA_DIR, file);
    const questions = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    const category = await getOrCreateCategory(slug);

    const result = await QuestionService.bulkInsertQuestions(
      category.id,
      questions,
    );

    console.log(
      `✅ ${category.name}: ${result.insertedCount} inserted, ${result.skippedCount} skipped (${questions.length} total in file)`,
    );
  }

  console.log("🎉 Question seed completed!");
};

runSeed()
  .catch((error) => {
    console.error("❌ Question seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
