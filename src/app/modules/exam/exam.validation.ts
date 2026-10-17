import z from "zod";

const startExam = z.object({
  body: z.object({
    categoryId: z.string({ required_error: "categoryId is required." }),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    questionCount: z
      .number({ required_error: "questionCount is required." })
      .refine((val) => [10, 20, 30].includes(val), {
        message: "questionCount must be 10, 20, or 30.",
      }),
  }),
});

const submitExam = z.object({
  body: z.object({
    answers: z.array(
      z.object({
        questionId: z.string(),
        selectedAnswers: z.array(z.string()),
      }),
    ),
    isAutoSubmit: z.boolean().optional(),
  }),
});

export const ExamValidation = {
  startExam,
  submitExam,
};
