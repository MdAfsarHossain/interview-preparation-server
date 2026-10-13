import express from "express";
import { AuthRouters } from "../modules/auth/auth.routes";
import { UserRoute } from "../modules/user/user.route";
import { AdminRoutes } from "../modules/admin/admin.route";
import { CategoryRoute } from "../modules/category/category.route";
import { QuestionRoute } from "../modules/question/question.route";
import { ExamRoute } from "../modules/exam/exam.route";
import { LeaderboardRoute } from "../modules/leaderboard/leaderboard.route";
import { ProgressRoute } from "../modules/progress/progress.route";
import { HealthRoute } from "../modules/health/health.route";

const router = express.Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRouters,
  },
  {
    path: "/user",
    route: UserRoute,
  },
  {
    path: "/admin",
    route: AdminRoutes,
  },
  {
    path: "/category",
    route: CategoryRoute,
  },
  {
    path: "/question",
    route: QuestionRoute,
  },
  {
    path: "/exam",
    route: ExamRoute,
  },
  {
    path: "/leaderboard",
    route: LeaderboardRoute,
  },
  {
    path: "/progress",
    route: ProgressRoute,
  },
  {
    path: "/health",
    route: HealthRoute,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
