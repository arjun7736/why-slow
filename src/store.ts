import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext, TimelineEvent } from "./types.js";

export const store = new AsyncLocalStorage<RequestContext>();

export function addEvent(event: TimelineEvent) {
  const ctx = store.getStore();
  if (ctx) {
    ctx.timeline.push(event);
  }
}

export function getContext() {
  return store.getStore();
}

export function getDbStats(events: TimelineEvent[]) {
  const dbEvents = events.filter(e => e.type === "db");

  const totalTime = dbEvents.reduce((a, e) => a + e.duration, 0);

  const queryMap = new Map<string, number>();

  for (const e of dbEvents) {
    const q = e.meta?.query || "unknown";
    queryMap.set(q, (queryMap.get(q) || 0) + 1);
  }

  let repeated = 0;

  for (const [, count] of queryMap) {
    if (count > 1) repeated += count - 1;
  }

  return {
    totalTime,
    totalCalls: dbEvents.length,
    uniqueQueries: queryMap.size,
    repeatedCalls: repeated
  };
}

export function getHttpStats(events: TimelineEvent[]) {
  const httpEvents = events.filter(e => e.type === "http");

  const totalTime = httpEvents.reduce((a, e) => a + e.duration, 0);

  const serviceMap = new Map<string, number>();

  for (const e of httpEvents) {
    const service = e.meta?.url || "unknown";
    serviceMap.set(service, (serviceMap.get(service) || 0) + 1);
  }

  return {
    totalTime,
    totalCalls: httpEvents.length,
    services: serviceMap
  };
}