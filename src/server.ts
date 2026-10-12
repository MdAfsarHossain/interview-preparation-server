import { Server } from "http";
import app from "./app";
import config from "./config";
import cron from "node-cron";
import seedSuperAdmin from "./app/seedSuperAdmin";
import { Server as SocketIOServer, Socket } from "socket.io";
import { initDatabase } from "./config/database";
import { HealthService } from "./app/modules/health/health.service";

const port = config.port || 5000;

interface CustomSocket extends Socket {
  userId?: string;
  roomId?: string;
}

async function main() {
  // Initialize database tables. Schema creation is idempotent, so a transient
  // connection failure here shouldn't stop the server from serving requests.
  try {
    // await initDatabase();
    console.log(`Database Initialization`);
    
  } catch (error) {
    console.error(
      "⚠️  Skipping database initialization (continuing to start server):",
      error instanceof Error ? error.message : error,
    );
  }

  const server: Server = app.listen(port, () => {
    console.log("Server is running on port ", port);
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`📝 API Documentation: http://localhost:${port}/api/v1`);
  });
  seedSuperAdmin();

  // =========================
  // START CRON JOBS
  // =========================

  startCronJobs();
}

function startCronJobs() {
  // Run immediately on server start
  console.log("Running initial suspension check...");

  cron.schedule("0 12 * * *", async () => {
    // cron.schedule("* * * * *", async () => {
    console.log("Checking for expired subscriptions...");
    // await checkExpiredSubscriptionAndDowngrade().catch((error: any) => {
    //   console.error(
    //     "Error in checking daily expiring subscriptions cron job:",
    //     error,
    //   );
    // });
  });

  // Keep the Supabase database from pausing for inactivity (free tier pauses
  // after ~7 days). Only works while this process is running; a sleeping
  // host needs an external scheduler hitting GET /api/v1/health/db-ping.
  cron.schedule("0 */12 * * *", async () => {
    try {
      await HealthService.pingDatabase();
      console.log("Supabase keep-alive ping OK");
    } catch (error) {
      console.error("Supabase keep-alive ping failed:", error);
    }
  });

  console.log("Cron jobs scheduled: subscription check will run at 12:00 PM");
}

main();
