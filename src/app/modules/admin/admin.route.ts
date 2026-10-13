import { Router } from "express";
import { AdminController } from "./admin.controller";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { AdminValidation } from "./admin.validation";
const route = Router();

route.patch(
  "/users/:id/status",
  auth("ADMIN"),
  validateRequest(AdminValidation.updateUserStatus),
  AdminController.updateUserStatus,
);

export const AdminRoutes = route;
