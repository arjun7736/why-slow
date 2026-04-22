import type { Request, Response, NextFunction } from "express";
import { store, addEvent } from "./store";
import { printReport } from "./printer";
import { patchFetch } from "./patches/fetch";
import { patchDbClients } from "./patches/db";

/**
 * Main middleware — automatically patches globalThis.fetch on first call.
 * Profiles DB calls, external HTTP requests, and overall application logic.
 */
export function whySlow() {
  // Patch fetch once when the middleware is registered
  patchFetch();
  patchDbClients();

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const ctx = { timeline: [] as import("./types").TimelineEvent[], startTime: start };

    // Capture ctx directly to ensure the report prints even if AsyncLocalStorage
    // context is lost when the 'finish' event fires.
    res.on("finish", () => {
      const total = Date.now() - start;
      printReport(req.method, req.originalUrl, total, ctx.timeline);
    });

    store.run(ctx, () => {
      next();
    });
  };
}

/**
 * Optional: wrap any middleware function to measure its execution time.
 */
export function trackMiddleware(fn: (req: Request, res: Response, next: NextFunction) => void) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    await fn(req, res, () => {
      addEvent({
        type: "middleware",
        duration: Date.now() - start,
      });
      next();
    });
  };
}
