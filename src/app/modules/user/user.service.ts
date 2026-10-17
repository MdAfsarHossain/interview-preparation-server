import httpStatus from "http-status";
import ApiError from "../../errors/ApiError";
import { S3Uploader } from "../../lib/S3Uploader";
import { query } from "../../utils/db";

// My Profile - profile + quiz performance summary
const myProfile = async (userId: string) => {
  const result = await query(
    `
        SELECT
            u.id,
            u.name,
            u.email,
            u.avatar,
            u.role,
            u.status,
            u.total_points,
            u."createdAt" as "createdAt",
            u."updatedAt" as "updatedAt",
            (
                SELECT COUNT(*)::int FROM exam_attempts ea
                WHERE ea.user_id = u.id AND ea.status != 'IN_PROGRESS'
            ) as total_attempts,
            (
                SELECT COUNT(*)::int + 1 FROM users u2
                WHERE u2.total_points > u.total_points AND u2.role = 'USER'
            ) as rank
        FROM users u
        WHERE u.id = $1::uuid
    `,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "This user is not registered.");
  }

  return result.rows[0];
};

// Get All Users (admin) - excluding current admin, paginated
const allUsers = async (userId: string, pagination: any) => {
  const { page = 1, limit = 10 } = pagination;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const offset = (pageNum - 1) * limitNum;

  const usersResult = await query(
    `
        SELECT
            u.id,
            u.name,
            u.avatar,
            u.email,
            u.role,
            u.status,
            u.is_active,
            u.total_points,
            u."createdAt" as "createdAt"
        FROM users u
        WHERE u.id != $1::uuid
        ORDER BY u."createdAt" DESC
        LIMIT $2 OFFSET $3
    `,
    [userId, limitNum, offset],
  );

  const countResult = await query(
    `
        SELECT COUNT(*) as total
        FROM users u
        WHERE u.id != $1::uuid
    `,
    [userId],
  );

  const totalUsers = parseInt(countResult.rows[0].total);
  const totalPage = Math.ceil(totalUsers / limitNum);

  return {
    meta: {
      page: pageNum,
      limit: limitNum,
      total: totalUsers,
      totalPage: totalPage,
      hasNextPage: pageNum < totalPage,
      hasPrevPage: pageNum > 1,
    },
    data: usersResult.rows,
  };
};

// Update User Profile
const updateUser = async (userId: string, payload: any, file?: any) => {
  const userResult = await query(
    `
        SELECT id, avatar FROM users WHERE id = $1::uuid
    `,
    [userId],
  );

  if (userResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "This user is not registered.");
  }

  const existingUser = userResult.rows[0];
  let avatar = existingUser.avatar;

  if (file) {
    try {
      const fileUrl = await S3Uploader.uploadToS3(
        file,
        `users/avatar/${userId}`,
      );
      avatar = fileUrl.Location;
    } catch (error) {
      throw new ApiError(
        httpStatus.SERVICE_UNAVAILABLE,
        "Profile image upload failed.",
      );
    }
  }

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (payload.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(payload.name);
  }

  if (avatar !== existingUser.avatar) {
    updates.push(`avatar = $${paramCount++}`);
    values.push(avatar);
  }

  if (updates.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No fields to update");
  }

  updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
  values.push(userId);

  const queryText = `
        UPDATE users
        SET ${updates.join(", ")}
        WHERE id = $${paramCount}
        RETURNING
            id,
            name,
            email,
            avatar,
            role,
            status,
            total_points,
            "createdAt" as "createdAt",
            "updatedAt" as "updatedAt"
    `;

  const result = await query(queryText, values);

  return result.rows[0];
};

export const UserService = {
  myProfile,
  allUsers,
  updateUser,
};
