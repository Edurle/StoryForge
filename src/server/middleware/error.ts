import express from "express";

export function errorHandler(
  err: Error,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
): void {
  console.error(err);
  res.status(500).json({ error: err.message });
}
