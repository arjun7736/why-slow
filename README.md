# why-api-slow 🚀

A zero-config, high-performance Express middleware to profile slow API requests. It gives you a beautiful breakdown of where your time is being spent: **Database**, **External HTTP calls**, **Middleware**, and **App Logic**.


## Features

- 🛠 **Zero Config**: Just `app.use(whySlow())` and it works.
- 🌐 **Auto-Patching**: Automatically tracks all `globalThis.fetch` calls.
- 🗄 **Auto DB Tracking**: Automatically tracks MongoDB native, Mongoose, and common SQL variants.
- ✍️ **Custom DB Tracking**: Record custom events for unsupported drivers easily.
- 🧠 **Smart Analysis**: Detects repeated DB queries automatically.
- 🎨 **Beautiful UI**: Color-coded terminal reports using Chalk.
- 📦 **Lightweight**: Minimal overhead using Node's `AsyncLocalStorage`.

## Installation

```bash
npm install why-api-slow
```

## Usage

### 1. Basic Setup
Just register the middleware at the top of your Express app.

```javascript
import express from 'express';
import { whySlow } from 'why-api-slow';

const app = express();

// Register middleware at the top
app.use(whySlow());

app.get('/test', async (req, res) => {
  // External fetch calls are tracked automatically
  await fetch('https://api.example.com/data');
  
  res.json({ ok: true });
});
```

### 2. Automatic DB Tracking (MongoDB + Mongoose + SQL)
If your app uses the MongoDB native driver (`mongodb`) or Mongoose (`mongoose`),
`whySlow()` auto-patches common query methods. No manual DB instrumentation required.

Supported SQL variants (auto-detected when installed):
- `pg`
- `mysql`
- `mysql2`
- `sequelize`
- `knex`
- `typeorm`

```javascript
import express from 'express';
import mongoose from 'mongoose';
import { whySlow } from 'why-api-slow';

const app = express();
app.use(whySlow()); // MongoDB/Mongoose/SQL DB calls are tracked automatically
```

### 3. Tracking Unsupported DB Drivers
For unsupported DB drivers or custom DB layers, use `addEvent`.

```javascript
import { addEvent } from 'why-api-slow';

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

### 4. Tracking Specific Middlewares
If you want to know exactly how long a specific middleware takes:

```javascript
import { trackMiddleware } from 'why-api-slow';

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
