import express from "express";
import { createAuthRouter } from "./routes/auth.js";
import { createGameRouter } from "./routes/game.js";

export function createApp() {
  const app = express();
  const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";

  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.status(204).send();
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/v1/auth", createAuthRouter());
  app.use("/v1/game", createGameRouter());

  app.use((_req, res) => {
    res.status(404).json({
      code: "NOT_FOUND",
      message: "Route not found.",
    });
  });

  return app;
}
