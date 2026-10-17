import httpStatus from "http-status";
import ApiError from "../../errors/ApiError";
import { query } from "../../utils/db";
import slugify from "../../utils/slugify";

// List all active categories with question counts
const getAllCategories = async () => {
  const result = await query(
    `
        SELECT
            c.id,
            c.name,
            c.slug,
            c.description,
            c.icon,
            c."createdAt" as "createdAt",
            COUNT(q.id) FILTER (WHERE q.is_active = true)::int as question_count
        FROM categories c
        LEFT JOIN questions q ON q.category_id = c.id
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY c.name ASC
    `,
  );

  return result.rows;
};

// Get a single category by slug, with a difficulty breakdown
const getCategoryBySlug = async (slug: string) => {
  const categoryResult = await query(
    `
        SELECT id, name, slug, description, icon, "createdAt" as "createdAt"
        FROM categories
        WHERE slug = $1 AND is_active = true
    `,
    [slug],
  );

  if (categoryResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found!");
  }

  const category = categoryResult.rows[0];

  const difficultyResult = await query(
    `
        SELECT difficulty, COUNT(*)::int as count
        FROM questions
        WHERE category_id = $1::uuid AND is_active = true
        GROUP BY difficulty
    `,
    [category.id],
  );

  return { ...category, difficultyBreakdown: difficultyResult.rows };
};

// Create a category (admin)
const createCategory = async (payload: {
  name: string;
  description?: string;
  icon?: string;
}) => {
  const slug = slugify(payload.name);

  const existing = await query(`SELECT id FROM categories WHERE slug = $1`, [
    slug,
  ]);

  if (existing.rows.length > 0) {
    throw new ApiError(httpStatus.CONFLICT, "This category already exists!");
  }

  const result = await query(
    `
        INSERT INTO categories (name, slug, description, icon, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, name, slug, description, icon
    `,
    [payload.name, slug, payload.description || null, payload.icon || null],
  );

  return result.rows[0];
};

// Update a category (admin)
const updateCategory = async (
  id: string,
  payload: { name?: string; description?: string; icon?: string },
) => {
  const existing = await query(`SELECT id FROM categories WHERE id = $1::uuid`, [
    id,
  ]);

  if (existing.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found!");
  }

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (payload.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(payload.name);
    updates.push(`slug = $${paramCount++}`);
    values.push(slugify(payload.name));
  }

  if (payload.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(payload.description);
  }

  if (payload.icon !== undefined) {
    updates.push(`icon = $${paramCount++}`);
    values.push(payload.icon);
  }

  if (updates.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No fields to update");
  }

  updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await query(
    `
        UPDATE categories
        SET ${updates.join(", ")}
        WHERE id = $${paramCount}
        RETURNING id, name, slug, description, icon
    `,
    values,
  );

  return result.rows[0];
};

// Deactivate a category (admin) - soft delete to preserve quiz history
const deactivateCategory = async (id: string) => {
  const result = await query(
    `
        UPDATE categories
        SET is_active = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
        RETURNING id
    `,
    [id],
  );

  if (result.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "Category not found!");
  }

  return null;
};

export const CategoryService = {
  getAllCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deactivateCategory,
};
