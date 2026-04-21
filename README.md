# why-slow 🚀

A zero-config, high-performance Express middleware to profile slow API requests. It gives you a beautiful breakdown of where your time is being spent: **Database**, **External HTTP calls**, **Middleware**, and **App Logic**.

![Sample Output](https://raw.githubusercontent.com/Arjun/why-slow/main/assets/sample.png)

## Features

- 🛠 **Zero Config**: Just `app.use(whySlow())` and it works.
- 🌐 **Auto-Patching**: Automatically tracks all `globalThis.fetch` calls.
- 🗄 **DB Tracking**: Record custom events (like DB queries) easily.
- 🧠 **Smart Analysis**: Detects repeated DB queries automatically.
- 🎨 **Beautiful UI**: Color-coded terminal reports using Chalk.
- 📦 **Lightweight**: Minimal overhead using Node's `AsyncLocalStorage`.

## Installation

```bash
npm install why-slow
```

## Usage

### 1. Basic Setup
Just register the middleware at the top of your Express app.

```javascript
import express from 'express';
import { whySlow } from 'why-slow';

const app = express();

// Register middleware at the top
app.use(whySlow());

app.get('/test', async (req, res) => {
  // External fetch calls are tracked automatically
  await fetch('https://api.example.com/data');
  
  res.json({ ok: true });
});
```

### 2. Tracking Database Queries
To track DB queries, use the `addEvent` function. You can wrap your DB driver's query method.

```javascript
import { addEvent } from 'why-slow';

async function query(sql) {
  const start = Date.now();
  const result = await db.execute(sql);
  
  addEvent({
    type: 'db',
    duration: Date.now() - start,
    meta: { query: sql }
  });
  
  return result;
}
```

### 3. Tracking Specific Middlewares
If you want to know exactly how long a specific middleware takes:

```javascript
import { trackMiddleware } from 'why-slow';

app.use(trackMiddleware(someSlowAuthMiddleware));
```

## Example Report

```text
──────────────────────────────────────────────────
🚀 GET    /api/users/1 → 513ms ● SLOW
──────────────────────────────────────────────────

Performance
  🗄 DB          320ms   (3 calls, 2 unique)
  🔁 Repeated    1 queries
  🌐 External    140ms   (1 calls)
  ⚙️ Middleware  0ms
  🧠 App         53ms

Total            513ms

External services
  • api.example.com (1 calls)
```

## License

MIT © [Arjun](https://github.com/Arjun)
