import { Router } from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { CategoryController } from "./category.controller";
import { CategoryValidation } from "./category.validation";

const route = Router();

route.get("/", auth(), CategoryController.getAllCategories);

route.get("/:slug", auth(), CategoryController.getCategoryBySlug);

route.post(
  "/",
  auth("ADMIN"),
  validateRequest(CategoryValidation.createCategory),
  CategoryController.createCategory,
);

route.patch(
  "/:id",
  auth("ADMIN"),
  validateRequest(CategoryValidation.updateCategory),
  CategoryController.updateCategory,
);

route.delete("/:id", auth("ADMIN"), CategoryController.deactivateCategory);

export const CategoryRoute = route;
