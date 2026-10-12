import cors from "cors";
import express, { Application, NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import globalErrorHandler from "./app/errors/globalErrorHandler";
import router from "./app/routes";
import path from "path";
import morgan from "morgan";
import config from "./config";

const app: Application = express();

app.use(
  cors({
    origin: [config.frontend_url, "http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "ngrok-skip-browser-warning", // Keep for dev, harmless in production
    ],
    credentials: true,
  }),
);

// app.use("/webhooks", WebhookRoute);

//parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "public", "uploads")),
);
console.log(path.join(__dirname, "..", "public", "uploads"));

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "home.html"));
});

app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/api/v1", router);

app.use(globalErrorHandler);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: "API NOT FOUND!",
    error: {
      path: req.originalUrl,
      message: "Your requested path is not found!",
    },
  });
});

export default app;
