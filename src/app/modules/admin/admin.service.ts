import httpStatus from "http-status";
import ApiError from "../../errors/ApiError";
import { query } from "../../utils/db";

// Update a user's account status (ACTIVE / INACTIVE / BLOCKED)
const updateUserStatus = async (userId: string, status: string) => {
  const userResult = await query(
    `
        SELECT id FROM users WHERE id = $1::uuid
    `,
    [userId],
  );

  if (userResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  const result = await query(
    `
        UPDATE users
        SET status = $1::"UserStatus", "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $2::uuid
        RETURNING id, name, email, role, status
    `,
    [status, userId],
  );

  return result.rows[0];
};

export const AdminService = {
  updateUserStatus,
};
