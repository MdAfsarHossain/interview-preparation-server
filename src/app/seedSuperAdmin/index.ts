import * as bcrypt from "bcrypt";
import config from "../../config";
import { pool } from "../../config/database";

const seedSuperAdmin = async () => {
  const client = await pool.connect();
  try {
    // Check if an admin already exists
    const isAdminExists = await client.query(
      `
      SELECT EXISTS (
        SELECT 1 FROM users
        WHERE role = $1::"Role"
      ) as exists
    `,
      ["ADMIN"],
    );

    const adminExists = isAdminExists.rows[0].exists;

    if (adminExists) {
      return;
    }

    const hashedPassword = await bcrypt.hash(
      config.super_admin_password as string,
      Number(config.bcrypt_salt_rounds) || 12,
    );

    await client.query(
      `
      INSERT INTO users (
        name,
        email,
        password,
        role,
        status,
        is_active,
        "createdAt",
        "updatedAt"
      ) VALUES (
        $1, $2, $3, $4::"Role", $5::"UserStatus", $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
      ["Admin", "admin@gmail.com", hashedPassword, "ADMIN", "ACTIVE", true],
    );
    console.log("Admin account created successfully.");
  } catch (error) {
    console.error("Error seeding Admin account:", error);
  } finally {
    client.release();
  }
};

export default seedSuperAdmin;
