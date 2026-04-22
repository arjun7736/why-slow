import { addEvent } from "../store.js";

let patched = false;

export function patchFetch() {
  if (patched) return;
  if (!globalThis.fetch) return;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    const start = Date.now();

    const res = await originalFetch(...args);

    const url = typeof args[0] === "string"
      ? args[0]
      : args[0] instanceof URL ? args[0].href : (args[0] as Request).url;

    addEvent({
      type: "http",
      duration: Date.now() - start, 
      meta: {
        url: normalizeUrl(url)
      }
    });

    return res;
  };

  patched = true;
}

function normalizeUrl(url: string) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return "unknown";
  }
}