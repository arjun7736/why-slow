import express from "express";
import { whySlow, addEvent } from "../index.js";

const app = express();

// ✅ whySlow() automatically patches globalThis.fetch — no patchFetch() needed
app.use(whySlow());

app.get("/test", async (_req, res) => {
  // Simulate DB calls (use addEvent to record them)
  await simulateDb("SELECT * FROM users WHERE id = 1", 120);
  await simulateDb("SELECT * FROM orders WHERE user_id = 1", 80);
  await simulateDb("SELECT * FROM users WHERE id = 1", 120); // repeated query

  // Simulate external HTTP call — tracked automatically via patched globalThis.fetch
  await fetch("https://jsonplaceholder.typicode.com/todos/1");

  // Simulate app logic
  await sleep(50);

  res.json({ ok: true });
});

app.get("/fast", async (_req, res) => {
  await simulateDb("SELECT 1", 10);
  res.json({ ok: true });
});

app.get("/mongo", async (_req, res) => {
  // Simulate MongoDB Read
  await simulateMongo("users", "findOne", { id: 1 }, 45);
  
  // Simulate MongoDB Write
  await simulateMongo("logs", "insertOne", { msg: "login" }, 150);

  res.json({ mongo: "ok" });
});

app.listen(3000, () => {
  console.log("✅ Test server running at http://localhost:3000");
  console.log("   Try: curl http://localhost:3000/test");
  console.log("   Try: curl http://localhost:3000/fast");
  console.log("   Try: curl http://localhost:3000/mongo");
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function simulateMongo(collection: string, op: string, filter: any, ms: number) {
  await sleep(ms);
  addEvent({
    type: "db",
    duration: ms,
    meta: { 
      query: `db.${collection}.${op}(${JSON.stringify(filter)})` 
    },
  });
}

async function simulateDb(query: string, ms: number) {
  await sleep(ms);
  addEvent({
    type: "db",
    duration: ms,
    meta: { query },
  });
}