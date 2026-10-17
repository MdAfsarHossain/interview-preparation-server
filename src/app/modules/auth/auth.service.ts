import * as bcrypt from "bcrypt";
import httpStatus from "http-status";
import { query } from "../../utils/db";
import config from "../../../config";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import { Secret } from "jsonwebtoken";
import ApiError from "../../errors/ApiError";
import { OTPFn } from "./OTPFn";
import { forgotEmailTemplate } from "../../utils/emailNotifications/forgotHTML";

// Create New Account
const createAccount = async (payload: {
  name: string;
  email: string;
  password: string;
}) => {
  // 1. Check if user already exists
  const existingUserResult = await query(
    `
      SELECT id FROM users WHERE email = $1
    `,
    [payload.email],
  );

  if (existingUserResult.rows.length > 0) {
    throw new ApiError(httpStatus.CONFLICT, "This email is already registered");
  }

  // 2. Hash password
  const hashedPassword = await bcrypt.hash(
    payload.password,
    Number(config.bcrypt_salt_rounds) || 12,
  );

  // 3. Insert user
  const userResult = await query(
    `
      INSERT INTO users (
        name,
        email,
        password,
        role,
        status,
        "createdAt",
        "updatedAt"
      ) VALUES (
        $1, $2, $3, 'USER'::"Role", 'ACTIVE'::"UserStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING
        id,
        name,
        email,
        role,
        status,
        total_points
    `,
    [payload.name, payload.email.trim(), hashedPassword],
  );

  const user = userResult.rows[0];

  // 4. Generate tokens
  const accessToken = jwtHelpers.generateToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    config.jwt.access_secret as Secret,
    config.jwt.access_expires_in as string,
  );

  const refreshToken = jwtHelpers.generateToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    config.jwt.refresh_secret as Secret,
    config.jwt.refresh_expires_in as string,
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    totalPoints: user.total_points,
    accessToken,
    refreshToken,
  };
};

// Login User
const loginUserFromDB = async (email: string, password: string) => {
  const result: any = await query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);

  const user = result.rows[0];

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  const isCorrectPassword = await bcrypt.compare(password, user.password);

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid password");
  }

  if (user.status === "BLOCKED") {
    throw new ApiError(httpStatus.FORBIDDEN, "Your account is blocked!");
  }

  const accessToken = jwtHelpers.generateToken(
    {
      id: user.id,
      email: user.email as string,
      role: user.role,
    },
    config.jwt.access_secret as Secret,
    config.jwt.access_expires_in as string,
  );

  const refreshToken = jwtHelpers.generateToken(
    {
      id: user.id,
      email: user.email as string,
      role: user.role,
    },
    config.jwt.refresh_secret as Secret,
    config.jwt.refresh_expires_in as string,
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    status: user.status,
    totalPoints: user.total_points,
    accessToken,
    refreshToken,
  };
};

// Helper function to generate OTP
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Forgot Password
const forgotPassword = async (payload: { email: string }) => {
  // Check if user exists
  const userResult = await query(
    `
        SELECT id, name, email FROM users WHERE email = $1
    `,
    [payload.email],
  );

  if (userResult.rows.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User not found");
  }

  const user = userResult.rows[0];

  await OTPFn(user.email, user.id, "Forgot Password OTP", forgotEmailTemplate);

  return {
    id: user.id,
    name: user.name,
    otpSent: true,
    message:
      "An OTP has been sent to your email address. Please check your email.",
    type: "forgotPassword",
  };
};

// Reset Password
const resetPassword = async (userId: string, newPassword: string) => {
  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds) || 12,
  );

  await query(
    `
        UPDATE users
        SET
            password = $1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $2::uuid
    `,
    [hashedPassword, userId],
  );

  return {
    message: "Please login with your new password",
  };
};

// Change Password
const changePassword = async (
  userId: string,
  payload: { oldPassword: string; newPassword: string },
) => {
  // Get user with password
  const userResult = await query(
    `
        SELECT id, email, password, status
        FROM users
        WHERE id = $1::uuid
    `,
    [userId],
  );

  if (userResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found!");
  }

  const user = userResult.rows[0];

  if (user.status === "BLOCKED") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Your account has been blocked. Please contact support.",
    );
  }

  const isCorrectPassword = await bcrypt.compare(
    payload.oldPassword,
    user.password,
  );
  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Credentials not matched");
  }

  const hashedPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds) || 12,
  );

  await query(
    `
        UPDATE users
        SET
            password = $1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $2::uuid
    `,
    [hashedPassword, userId],
  );

  return {
    message: "Password updated successfully",
  };
};

// Verify Reset Password OTP
const verifyResetPasswordOtp = async (userId: string, otpCode: string) => {
  const otpResult = await query(
    `
            SELECT id, expiry, otp_code
            FROM otp
            WHERE user_id = $1::uuid AND otp_code = $2
        `,
    [userId, otpCode],
  );

  if (otpResult.rows.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid OTP or expired OTP");
  }

  const otpRecord = otpResult.rows[0];

  if (new Date(otpRecord.expiry) < new Date()) {
    await query(
      `
                DELETE FROM otp WHERE id = $1::uuid
            `,
      [otpRecord.id],
    );
    throw new ApiError(httpStatus.REQUEST_TIMEOUT, "OTP expired");
  }

  await query(
    `
            DELETE FROM otp WHERE user_id = $1::uuid
        `,
    [userId],
  );

  const accessToken = jwtHelpers.generateToken(
    { id: userId },
    config.jwt.reset_pass_secret as Secret,
    config.jwt.reset_pass_token_expires_in as string,
  );

  return {
    message: "OTP verified successfully",
    userId,
    accessToken,
  };
};

// Resend OTP
const resendOtp = async (userId: string) => {
  const userResult = await query(
    `
        SELECT id, name, email
        FROM users
        WHERE id = $1::uuid
    `,
    [userId],
  );

  if (userResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, "User Not found");
  }

  const existingUser = userResult.rows[0];

  await OTPFn(
    existingUser.email,
    existingUser.id,
    "OTP Resend",
    forgotEmailTemplate,
  );

  return {
    id: existingUser.id,
    name: existingUser.name,
    email: existingUser.email,
    type: "resendOtp",
    message: "OTP Resend successfully to your email",
    otpSent: true,
  };
};

export const AuthServices = {
  createAccount,
  loginUserFromDB,
  forgotPassword,
  verifyResetPasswordOtp,
  resetPassword,
  changePassword,
  resendOtp,
};
