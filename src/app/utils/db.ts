import { QueryResult } from "pg";
import { pool } from "../../config/database";

// Helper function for queries
export const query = async (
  text: string,
  params?: any[],
): Promise<QueryResult> => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    // console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error("Query error:", { text, error });
    throw error;
  }
};

// Transaction helper
export const transaction = async <T>(
  callback: (client: any) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
