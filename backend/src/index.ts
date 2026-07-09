import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import swaggerUi from "swagger-ui-express";
import { validateEnv } from "./lib/env";
import { logger } from "./lib/logger";
import { requestIdMiddleware } from "./lib/requestId";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { authMiddleware } from "./middleware/auth";
import { createRateLimiter } from "./middleware/rateLimiter";
import { chatRouter } from "./middleware/chatRouter";
import { approveRouter } from "./middleware/approveRouter";
import { getHealth } from "./lib/health";
import { prisma } from "./db";
import { apiSpec } from "./openapi";

const isVercel = process.env.VERCEL === "1";

if (!isVercel) {
  validateEnv();
}

const app = express();
const PORT = process.env.PORT || 4000;
const isDev = process.env.NODE_ENV !== "production";

// ---------------------------------------------------------------------------
// Security & infrastructure middleware (order matters)
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:3000", "https://*.vercel.app"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "10kb" }));
app.disable("x-powered-by");

// Request tracing
app.use(requestIdMiddleware);
app.use(requestLogger);

// ---------------------------------------------------------------------------
// Public routes (no auth)
// ---------------------------------------------------------------------------
app.get("/health", async (_req, res) => {
  const health = await getHealth();
  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode).json(health);
});

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(apiSpec, {
    customSiteTitle: "HobbyFi Copilot API",
  }),
);

app.post("/api/auth/demo-login", (req, res) => {
  const { vendorId } = req.body;
  const validVendors: Record<string, string> = {
    "vendor-a-0001-0000-0000-000000000001": "Rahul Sharma",
    "vendor-b-0002-0000-0000-000000000002": "Priya Patel",
  };

  if (!vendorId || !validVendors[vendorId]) {
    return res.status(401).json({
      error: { code: "INVALID_VENDOR", message: "Invalid vendor credentials" },
    });
  }

  const secret = process.env.JWT_SECRET!;
  const token = jwt.sign({ vendorId, vendorName: validVendors[vendorId] }, secret, {
    expiresIn: "1h",
    issuer: "hobbyfi",
  });

  logger.info("Demo login", { vendorId, vendorName: validVendors[vendorId] });
  res.json({ token, vendorId, vendorName: validVendors[vendorId] });
});

// ---------------------------------------------------------------------------
// Protected routes
// ---------------------------------------------------------------------------
app.use("/api/copilot/chat", authMiddleware, createRateLimiter({ windowMs: 60_000, max: 30 }), chatRouter);
app.use("/api/copilot/approve", authMiddleware, createRateLimiter({ windowMs: 60_000, max: 60 }), approveRouter);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server start & graceful shutdown (local dev only)
// ---------------------------------------------------------------------------
if (!isVercel) {
  const server = app.listen(PORT, () => {
    logger.info(`HobbyFi Copilot API running on http://localhost:${PORT}`, {
      env: isDev ? "development" : "production",
    });
  });

  async function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      prisma.$disconnect().then(() => {
        logger.info("Goodbye.");
        process.exit(0);
      });
    });
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;
