import httpStatus from "http-status";
import ApiError from "../../errors/ApiError";
import { query, transaction } from "../../utils/db";
import { paginationHelper } from "../../helpers/paginationHelper";

const POINTS_MAP: Record<string, number> = {
  EASY: 5,
  MEDIUM: 10,
  HARD: 15,
};

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];

// Split the requested question count evenly across EASY/MEDIUM/HARD
const splitCountAcrossDifficulties = (count: number) => {
  const base = Math.floor(count / 3);
  const remainder = count % 3;
  return DIFFICULTIES.reduce(
    (acc, difficulty, index) => {
      acc[difficulty] = base + (index < remainder ? 1 : 0);
      return acc;
    },
    {} as Record<string, number>,
  );
};

const shuffle = <T>(items: T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const sameAnswerSet = (a: string[], b: string[]) => {
  if (a.length === 0 || a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
};

// Start a new timed exam
const startExam = async (
  userId: string,
  payload: {
    categoryId: string;
    difficulty?: "EASY" | "MEDIUM" | "HARD";
    questionCount: number;
  },
) => {
  const { categoryId, difficulty, questionCount } = payload;

  const categoryResult = await query(
    `SELECT id, name, slug FROM categories WHERE id = $1::uuid AND is_active = true`,
    [categoryId],
  );

  if (categoryResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found!");
  }

  const category = categoryResult.rows[0];

  let questionRows: any[] = [];

  if (difficulty) {
    const result = await query(
      `
          SELECT id, question_type, question_text, options, difficulty
          FROM questions
          WHERE category_id = $1::uuid AND difficulty = $2::"Difficulty" AND is_active = true
          ORDER BY random()
          LIMIT $3
      `,
      [categoryId, difficulty, questionCount],
    );
    questionRows = result.rows;
  } else {
    const buckets = splitCountAcrossDifficulties(questionCount);

    for (const level of DIFFICULTIES) {
      const bucketCount = buckets[level];
      if (bucketCount === 0) continue;

      const result = await query(
        `
            SELECT id, question_type, question_text, options, difficulty
            FROM questions
            WHERE category_id = $1::uuid AND difficulty = $2::"Difficulty" AND is_active = true
            ORDER BY random()
            LIMIT $3
        `,
        [categoryId, level, bucketCount],
      );
      questionRows.push(...result.rows);
    }

    questionRows = shuffle(questionRows);
  }

  if (questionRows.length < questionCount) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Not enough questions available for "${category.name}"${
        difficulty ? ` (${difficulty})` : ""
      } yet. Only ${questionRows.length} question(s) found.`,
    );
  }

  const durationSeconds = questionCount * 60;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000);

  const attempt = await transaction(async (client) => {
    const attemptResult = await client.query(
      `
          INSERT INTO exam_attempts (
              user_id, category_id, difficulty, question_count, duration_seconds,
              expires_at, status, "createdAt", "updatedAt"
          ) VALUES (
              $1::uuid, $2::uuid, $3, $4, $5, $6, 'IN_PROGRESS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          RETURNING id, started_at, expires_at
      `,
      [
        userId,
        categoryId,
        difficulty || "MIXED",
        questionCount,
        durationSeconds,
        expiresAt,
      ],
    );

    const attemptRow = attemptResult.rows[0];

    for (let i = 0; i < questionRows.length; i++) {
      await client.query(
        `
            INSERT INTO exam_attempt_answers (
                exam_attempt_id, question_id, question_order, "createdAt"
            ) VALUES ($1::uuid, $2::uuid, $3, CURRENT_TIMESTAMP)
        `,
        [attemptRow.id, questionRows[i].id, i + 1],
      );
    }

    return attemptRow;
  });

  return {
    attemptId: attempt.id,
    category: { id: category.id, name: category.name, slug: category.slug },
    difficulty: difficulty || "MIXED",
    questionCount,
    durationSeconds,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    questions: questionRows.map((q, index) => ({
      questionId: q.id,
      order: index + 1,
      questionType: q.question_type,
      questionText: q.question_text,
      options: q.options,
      difficulty: q.difficulty,
    })),
  };
};

// Resume an in-progress attempt (used when the exam page is reloaded).
// Never returns correct_answers/explanation while the exam is still running.
const getRunningExam = async (userId: string, attemptId: string) => {
  const attemptResult = await query(
    `
        SELECT ea.*, c.name as category_name, c.slug as category_slug
        FROM exam_attempts ea
        JOIN categories c ON c.id = ea.category_id
        WHERE ea.id = $1::uuid AND ea.user_id = $2::uuid
    `,
    [attemptId, userId],
  );

  if (attemptResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "Exam attempt not found!");
  }

  const attempt = attemptResult.rows[0];

  if (attempt.status !== "IN_PROGRESS") {
    throw new ApiError(
      httpStatus.CONFLICT,
      "This exam has already been submitted.",
    );
  }

  const questionsResult = await query(
    `
        SELECT
            eaa.question_order, eaa.selected_answers,
            q.id as question_id, q.question_text, q.question_type,
            q.options, q.difficulty
        FROM exam_attempt_answers eaa
        JOIN questions q ON q.id = eaa.question_id
        WHERE eaa.exam_attempt_id = $1::uuid
        ORDER BY eaa.question_order ASC
    `,
    [attemptId],
  );

  return {
    attemptId: attempt.id,
    category: {
      id: attempt.category_id,
      name: attempt.category_name,
      slug: attempt.category_slug,
    },
    difficulty: attempt.difficulty,
    questionCount: attempt.question_count,
    durationSeconds: attempt.duration_seconds,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    questions: questionsResult.rows.map((q) => ({
      questionId: q.question_id,
      order: q.question_order,
      questionType: q.question_type,
      questionText: q.question_text,
      options: q.options,
      difficulty: q.difficulty,
      selectedAnswers: q.selected_answers ?? [],
    })),
  };
};

// Submit (or auto-submit) an exam attempt
const submitExam = async (
  userId: string,
  attemptId: string,
  payload: {
    answers: { questionId: string; selectedAnswers: string[] }[];
    isAutoSubmit?: boolean;
  },
) => {
  const attemptResult = await query(
    `SELECT * FROM exam_attempts WHERE id = $1::uuid AND user_id = $2::uuid`,
    [attemptId, userId],
  );

  if (attemptResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "Exam attempt not found!");
  }

  const attempt = attemptResult.rows[0];

  if (attempt.status !== "IN_PROGRESS") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This exam has already been submitted.",
    );
  }

  const answersMap = new Map<string, string[]>(
    (payload.answers || []).map((a) => [a.questionId, a.selectedAnswers || []]),
  );

  const summary = await transaction(async (client) => {
    const rowsResult = await client.query(
      `
          SELECT eaa.id, eaa.question_id, q.difficulty, q.correct_answers
          FROM exam_attempt_answers eaa
          JOIN questions q ON q.id = eaa.question_id
          WHERE eaa.exam_attempt_id = $1::uuid
      `,
      [attemptId],
    );

    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    for (const row of rowsResult.rows) {
      const selected = answersMap.get(row.question_id) || [];
      const isCorrect = sameAnswerSet(selected, row.correct_answers);
      const pointsEarned = isCorrect ? POINTS_MAP[row.difficulty] : 0;

      if (selected.length === 0) unansweredCount++;
      else if (isCorrect) correctCount++;
      else wrongCount++;

      totalScore += pointsEarned;

      await client.query(
        `
            UPDATE exam_attempt_answers
            SET selected_answers = $1, is_correct = $2, points_earned = $3
            WHERE id = $4::uuid
        `,
        [selected, isCorrect, pointsEarned, row.id],
      );
    }

    const status = payload.isAutoSubmit ? "AUTO_SUBMITTED" : "COMPLETED";

    await client.query(
      `
          UPDATE exam_attempts
          SET status = $1::"ExamStatus", submitted_at = CURRENT_TIMESTAMP,
              total_score = $2, correct_count = $3, wrong_count = $4,
              unanswered_count = $5, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = $6::uuid
      `,
      [status, totalScore, correctCount, wrongCount, unansweredCount, attemptId],
    );

    await client.query(
      `UPDATE users SET total_points = total_points + $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2::uuid`,
      [totalScore, userId],
    );

    return { totalScore, correctCount, wrongCount, unansweredCount, status };
  });

  return {
    attemptId,
    questionCount: attempt.question_count,
    ...summary,
  };
};

// Full per-question breakdown for the result/review screen
const getExamResult = async (userId: string, attemptId: string) => {
  const attemptResult = await query(
    `
        SELECT ea.*, c.name as category_name, c.slug as category_slug
        FROM exam_attempts ea
        JOIN categories c ON c.id = ea.category_id
        WHERE ea.id = $1::uuid AND ea.user_id = $2::uuid
    `,
    [attemptId, userId],
  );

  if (attemptResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "Exam attempt not found!");
  }

  const attempt = attemptResult.rows[0];

  if (attempt.status === "IN_PROGRESS") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This exam has not been submitted yet.",
    );
  }

  const questionsResult = await query(
    `
        SELECT
            eaa.question_order, eaa.selected_answers, eaa.is_correct, eaa.points_earned,
            q.id as question_id, q.question_text, q.question_type, q.options,
            q.correct_answers, q.explanation, q.difficulty
        FROM exam_attempt_answers eaa
        JOIN questions q ON q.id = eaa.question_id
        WHERE eaa.exam_attempt_id = $1::uuid
        ORDER BY eaa.question_order ASC
    `,
    [attemptId],
  );

  return {
    attempt: {
      id: attempt.id,
      category: { name: attempt.category_name, slug: attempt.category_slug },
      difficulty: attempt.difficulty,
      questionCount: attempt.question_count,
      status: attempt.status,
      totalScore: attempt.total_score,
      correctCount: attempt.correct_count,
      wrongCount: attempt.wrong_count,
      unansweredCount: attempt.unanswered_count,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
    },
    questions: questionsResult.rows.map((q) => ({
      order: q.question_order,
      questionId: q.question_id,
      questionText: q.question_text,
      questionType: q.question_type,
      difficulty: q.difficulty,
      options: q.options,
      correctAnswers: q.correct_answers,
      selectedAnswers: q.selected_answers,
      isCorrect: q.is_correct,
      pointsEarned: q.points_earned,
      explanation: q.explanation,
    })),
  };
};

// Paginated history of past (submitted) exam attempts
const getExamHistory = async (userId: string, options: any) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);

  const result = await query(
    `
        SELECT
            ea.id, ea.difficulty, ea.question_count, ea.status, ea.total_score,
            ea.correct_count, ea.wrong_count, ea.unanswered_count,
            ea.started_at, ea.submitted_at,
            c.name as category_name, c.slug as category_slug
        FROM exam_attempts ea
        JOIN categories c ON c.id = ea.category_id
        WHERE ea.user_id = $1::uuid AND ea.status != 'IN_PROGRESS'
        ORDER BY ea."createdAt" DESC
        LIMIT $2 OFFSET $3
    `,
    [userId, limit, skip],
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM exam_attempts WHERE user_id = $1::uuid AND status != 'IN_PROGRESS'`,
    [userId],
  );

  const total = parseInt(countResult.rows[0].total);

  return {
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
    data: result.rows,
  };
};

export const ExamService = {
  startExam,
  getRunningExam,
  submitExam,
  getExamResult,
  getExamHistory,
};
