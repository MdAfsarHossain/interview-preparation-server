import { Router } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { ExamController } from "./exam.controller";
import { ExamValidation } from "./exam.validation";

const route = Router();

route.post(
  "/start",
  auth(),
  validateRequest(ExamValidation.startExam),
  ExamController.startExam,
);

route.post(
  "/:id/submit",
  auth(),
  validateRequest(ExamValidation.submitExam),
  ExamController.submitExam,
);

route.get("/history", auth(), ExamController.getExamHistory);

route.get("/:id/result", auth(), ExamController.getExamResult);

route.get("/:id", auth(), ExamController.getRunningExam);

export const ExamRoute = route;
