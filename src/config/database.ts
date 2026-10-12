import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Connection pool for regular queries (using pooled connection)
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 45000,
  keepAlive: true, // Keep connections alive
  keepAliveInitialDelayMillis: 10000, // Initial delay for keepalive
  statement_timeout: 60000, // Statement timeout (60 seconds)
  query_timeout: 45000, // Query timeout (45 seconds)
};

// Direct connection for migrations (using direct URL)
const directPoolConfig = {
  connectionString: process.env.DIRECT_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased timeout
  keepAlive: true,
};

// Create connection pools
export const pool = new Pool(poolConfig);
export const directPool = new Pool(directPoolConfig);

// Test database connection
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log("✅ Database connected successfully via pooled connection");
    client.release();

    const directClient = await directPool.connect();
    console.log("✅ Direct database connection successful");
    directClient.release();

    return true;
  } catch (error) {
    console.error("❌ Database connection error:", error);
    return false;
  }
};

const createEnumsWithDOBlock = async (client: any) => {
  await client.query(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
            CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');
        END IF;
    END $$;
  `);

  await client.query(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserStatus') THEN
            CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');
        END IF;
    END $$;
  `);

  await client.query(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Difficulty') THEN
            CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
        END IF;
    END $$;
  `);

  await client.query(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionType') THEN
            CREATE TYPE "QuestionType" AS ENUM ('SINGLE', 'MULTIPLE');
        END IF;
    END $$;
  `);

  await client.query(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExamStatus') THEN
            CREATE TYPE "ExamStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'AUTO_SUBMITTED');
        END IF;
    END $$;
  `);
};

// Acquire a connection, retrying a few times — the pooled Supabase endpoint
// intermittently times out on the first attempt.
const connectWithRetry = async (pool: Pool, attempts = 4) => {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await pool.connect();
    } catch (error) {
      lastError = error;
      console.warn(
        `⚠️  Database connection attempt ${i}/${attempts} failed, retrying...`,
      );
      await new Promise((resolve) => setTimeout(resolve, i * 2000));
    }
  }
  throw lastError;
};

// Initialize database tables
export const initDatabase = async () => {
  const client = await connectWithRetry(directPool);
  try {
    await client.query("BEGIN");
    // -- ============================================================
    // -- ENUMS
    // -- ============================================================

    // Create all ENUM types
    console.log("📝 Creating ENUM types...");

    // Method 1: Using function
    //   await createAllEnums(client);

    // OR Method 2: Using DO blocks
    await createEnumsWithDOBlock(client);

    console.log("✅ ENUM types created successfully");

    // -- ============================================================
    // -- TABLES
    // -- ============================================================

    // -- Users
    await client.query(`CREATE TABLE IF NOT EXISTS users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(255) NOT NULL,
  email                   VARCHAR(255) UNIQUE NOT NULL,
  password                TEXT NOT NULL,
  avatar                  TEXT,
  role                    "Role" DEFAULT 'USER',
  status                  "UserStatus" DEFAULT 'ACTIVE',
  is_active               BOOLEAN DEFAULT true,
  total_points            INTEGER DEFAULT 0,
  "createdAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_users_role             ON users (role);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_users_status           ON users (status);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_users_is_active        ON users (is_active);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_users_total_points     ON users (total_points DESC);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_users_created_at       ON users ("createdAt");`,
    );

    // -- OTP (forgot password / email verification codes)
    await client.query(`CREATE TABLE IF NOT EXISTS otp (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_code                VARCHAR(10) NOT NULL,
  expiry                  TIMESTAMP NOT NULL,
  "createdAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_otp_user_id            ON otp (user_id);`,
    );

    // -- Categories (quiz topics: HTML, CSS, JavaScript, React, ...)
    await client.query(`CREATE TABLE IF NOT EXISTS categories (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(255) NOT NULL,
  slug                    VARCHAR(255) UNIQUE NOT NULL,
  description             TEXT,
  icon                    TEXT,
  is_active               BOOLEAN DEFAULT true,
  "createdAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_categories_is_active   ON categories (is_active);`,
    );

    // -- Questions
    await client.query(`CREATE TABLE IF NOT EXISTS questions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id             UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  difficulty              "Difficulty" NOT NULL DEFAULT 'EASY',
  question_type           "QuestionType" NOT NULL DEFAULT 'SINGLE',
  question_text           TEXT NOT NULL,
  options                 JSONB NOT NULL,
  correct_answers         TEXT[] NOT NULL,
  explanation             TEXT,
  is_active               BOOLEAN DEFAULT true,
  "createdAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_questions_category_id  ON questions (category_id);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_questions_difficulty   ON questions (difficulty);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_questions_cat_diff     ON questions (category_id, difficulty);`,
    );

    // -- Exam Attempts
    await client.query(`CREATE TABLE IF NOT EXISTS exam_attempts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id             UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  difficulty              VARCHAR(20) NOT NULL DEFAULT 'MIXED',
  question_count          INTEGER NOT NULL,
  duration_seconds        INTEGER NOT NULL,
  started_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at              TIMESTAMP NOT NULL,
  submitted_at            TIMESTAMP,
  status                  "ExamStatus" DEFAULT 'IN_PROGRESS',
  total_score             INTEGER DEFAULT 0,
  correct_count           INTEGER DEFAULT 0,
  wrong_count             INTEGER DEFAULT 0,
  unanswered_count        INTEGER DEFAULT 0,
  "createdAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_id  ON exam_attempts (user_id);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_exam_attempts_cat_id   ON exam_attempts (category_id);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_exam_attempts_status   ON exam_attempts (status);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_exam_attempts_created  ON exam_attempts ("createdAt");`,
    );

    // -- Exam Attempt Answers
    await client.query(`CREATE TABLE IF NOT EXISTS exam_attempt_answers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_attempt_id         UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id             UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_order          INTEGER NOT NULL,
  selected_answers        TEXT[] DEFAULT '{}',
  is_correct              BOOLEAN DEFAULT false,
  points_earned           INTEGER DEFAULT 0,
  "createdAt"             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON exam_attempt_answers (exam_attempt_id);`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_attempt_answers_question ON exam_attempt_answers (question_id);`,
    );

    // -- ============================================================

    await client.query("COMMIT");
    console.log("✅ Database tables and triggers created successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Database initialization error:", error);
    throw error;
  } finally {
    client.release();
  }
};

// Close all database connections
export const closeDatabase = async () => {
  await pool.end();
  await directPool.end();
  console.log("Database connections closed");
};
