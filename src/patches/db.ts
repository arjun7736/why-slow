import { createRequire } from "node:module";
import { addEvent } from "../store.js";

const localRequire = createRequire(import.meta.url);
const WRAPPED = Symbol.for("whySlow.wrapped");

let patched = false;

type AnyFunction = (...args: any[]) => any;
type AnyRecord = { [key: string | symbol]: any };

/**
 * Automatically patches supported DB clients so users get DB timings
 * without manually calling addEvent().
 */
export function patchDbClients() {
  if (patched) return;

  patchMongoNative();
  patchMongoose();
  patchSqlClients();

  patched = true;
}

function patchSqlClients() {
  patchPg();
  patchMysql();
  patchMysql2();
  patchMysql2Promise();
  patchSequelize();
  patchKnex();
  patchTypeOrm();
}

function patchMongoNative() {
  const mongodb = tryRequireModule("mongodb");
  if (!mongodb) return;

  const Collection = mongodb.Collection as { prototype?: AnyRecord } | undefined;
  const prototype = Collection?.prototype;
  if (!prototype) return;

  const methods = [
    "findOne",
    "insertOne",
    "insertMany",
    "updateOne",
    "updateMany",
    "replaceOne",
    "deleteOne",
    "deleteMany",
    "findOneAndUpdate",
    "findOneAndReplace",
    "findOneAndDelete",
    "countDocuments",
    "estimatedDocumentCount",
    "distinct",
    "bulkWrite"
  ];

  for (const method of methods) {
    wrapMethod(prototype, method, function (this: AnyRecord, args: any[]) {
      const collection = asString(this?.collectionName, "unknown");
      const preview = shortValue(args[0]);
      return preview
        ? `mongodb.${collection}.${method}(${preview})`
        : `mongodb.${collection}.${method}`;
    });
  }
}

function patchPg() {
  const pg = tryRequireModule("pg");
  if (!pg) return;

  const Client = pg.Client as { prototype?: AnyRecord } | undefined;
  const Pool = pg.Pool as { prototype?: AnyRecord } | undefined;

  if (Client?.prototype) {
    patchSqlTarget(Client.prototype, "pg");
  }

  if (Pool?.prototype) {
    patchSqlTarget(Pool.prototype, "pg");
  }
}

function patchMysql() {
  const mysql = tryRequireModule("mysql");
  if (!mysql) return;

  const Connection = mysql.Connection as { prototype?: AnyRecord } | undefined;
  const Pool = mysql.Pool as { prototype?: AnyRecord } | undefined;

  if (Connection?.prototype) {
    patchSqlTarget(Connection.prototype, "mysql");
    patchPromiseAccessor(Connection.prototype, "mysql");
  }

  if (Pool?.prototype) {
    patchSqlTarget(Pool.prototype, "mysql");
    patchPromiseAccessor(Pool.prototype, "mysql");
  }

  patchFactory(mysql, "createConnection", "mysql");
  patchFactory(mysql, "createPool", "mysql");
}

function patchMysql2() {
  const mysql2 = tryRequireModule("mysql2");
  if (!mysql2) return;

  const Connection = mysql2.Connection as { prototype?: AnyRecord } | undefined;
  const Pool = mysql2.Pool as { prototype?: AnyRecord } | undefined;

  if (Connection?.prototype) {
    patchSqlTarget(Connection.prototype, "mysql2");
    patchPromiseAccessor(Connection.prototype, "mysql2");
  }

  if (Pool?.prototype) {
    patchSqlTarget(Pool.prototype, "mysql2");
    patchPromiseAccessor(Pool.prototype, "mysql2");
  }

  patchFactory(mysql2, "createConnection", "mysql2");
  patchFactory(mysql2, "createPool", "mysql2");
}

function patchMysql2Promise() {
  const mysql2Promise = tryRequireModule("mysql2/promise");
  if (!mysql2Promise) return;

  patchFactory(mysql2Promise, "createConnection", "mysql2.promise");
  patchFactory(mysql2Promise, "createPool", "mysql2.promise");
}

function patchSequelize() {
  const sequelize = tryRequireModule("sequelize");
  if (!sequelize) return;

  const Sequelize = sequelize.Sequelize as { prototype?: AnyRecord } | undefined;
  const prototype = Sequelize?.prototype;
  if (!prototype) return;

  wrapMethod(prototype, "query", function (this: AnyRecord, args: any[]) {
    const sql = extractSqlFromArgs(args);
    return buildSqlLabel("sequelize", resolveSqlSource(this), "query", sql);
  });
}

function patchKnex() {
  const knex = tryRequireModule("knex");
  if (!knex) return;

  const Client = knex.Client as { prototype?: AnyRecord } | undefined;
  const prototype = Client?.prototype;
  if (!prototype) return;

  wrapMethod(prototype, "query", function (this: AnyRecord, args: any[]) {
    const queryArg = args.length > 1 ? args[1] : args[0];
    const sql = extractSql(queryArg);
    const dialect = asString(this?.config?.client, "unknown");
    return buildSqlLabel("knex", dialect, "query", sql);
  });
}

function patchTypeOrm() {
  const typeorm = tryRequireModule("typeorm");
  if (!typeorm) return;

  const DataSource = typeorm.DataSource as { prototype?: AnyRecord } | undefined;
  const EntityManager = typeorm.EntityManager as { prototype?: AnyRecord } | undefined;

  if (DataSource?.prototype) {
    wrapMethod(DataSource.prototype, "query", function (this: AnyRecord, args: any[]) {
      const sql = extractSqlFromArgs(args);
      return buildSqlLabel("typeorm", resolveSqlSource(this?.options ?? this), "query", sql);
    });
  }

  if (EntityManager?.prototype) {
    wrapMethod(EntityManager.prototype, "query", function (this: AnyRecord, args: any[]) {
      const sql = extractSqlFromArgs(args);
      const source = resolveSqlSource(this?.connection ?? this?.dataSource ?? this);
      return buildSqlLabel("typeorm", source, "query", sql);
    });
  }
}

function patchMongoose() {
  const mongoose = tryRequireModule("mongoose");
  if (!mongoose) return;

  const Query = mongoose.Query as { prototype?: AnyRecord } | undefined;
  const Aggregate = mongoose.Aggregate as { prototype?: AnyRecord } | undefined;
  const Model = mongoose.Model as AnyRecord | undefined;

  if (Query?.prototype) {
    wrapMethod(Query.prototype, "exec", function (this: AnyRecord) {
      const model = asString(this?.model?.modelName, "unknown");
      const op = asString(this?.op, "query");
      const filter = typeof this?.getFilter === "function"
        ? shortValue(this.getFilter())
        : shortValue(this?._conditions);

      return filter
        ? `mongoose.${model}.${op}(${filter})`
        : `mongoose.${model}.${op}`;
    });
  }

  if (Aggregate?.prototype) {
    wrapMethod(Aggregate.prototype, "exec", function (this: AnyRecord) {
      const model = asString(this?._model?.modelName, "unknown");
      return `mongoose.${model}.aggregate`;
    });
  }

  if (Model?.prototype) {
    wrapMethod(Model.prototype, "save", function (this: AnyRecord) {
      const model = asString((this.constructor as AnyRecord)?.modelName, "unknown");
      return `mongoose.${model}.save`;
    });
  }

  if (Model) {
    wrapMethod(Model, "insertMany", function (this: AnyRecord, args: any[]) {
      const model = asString(this?.modelName, "unknown");
      const count = Array.isArray(args[0]) ? args[0].length : 1;
      return `mongoose.${model}.insertMany(${count})`;
    });
  }
}

function wrapMethod(
  target: AnyRecord,
  method: string,
  getQueryLabel: (this: AnyRecord, args: any[]) => string
) {
  const original = target[method];
  if (typeof original !== "function") return;
  if ((original as AnyRecord)[WRAPPED]) return;

  const wrapped = function (this: AnyRecord, ...args: any[]) {
    const startedAt = Date.now();
    const query = safeBuildLabel(getQueryLabel, this, args, method);

    const callbackIndex = typeof args[args.length - 1] === "function"
      ? args.length - 1
      : -1;

    if (callbackIndex >= 0) {
      const originalCallback = args[callbackIndex] as AnyFunction;

      args[callbackIndex] = (...callbackArgs: any[]) => {
        pushDbEvent(startedAt, query);
        return originalCallback.apply(this, callbackArgs);
      };

      try {
        return original.apply(this, args);
      } catch (error) {
        pushDbEvent(startedAt, query);
        throw error;
      }
    }

    try {
      const result = original.apply(this, args);

      if (result && typeof (result as Promise<unknown>).then === "function") {
        return Promise.resolve(result).finally(() => {
          pushDbEvent(startedAt, query);
        });
      }

      if (isEventEmitterLike(result)) {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          pushDbEvent(startedAt, query);
        };

        result.once("end", finish);
        result.once("error", finish);
        result.once("close", finish);
        result.once("finish", finish);
        return result;
      }

      pushDbEvent(startedAt, query);
      return result;
    } catch (error) {
      pushDbEvent(startedAt, query);
      throw error;
    }
  };

  (wrapped as AnyRecord)[WRAPPED] = true;
  target[method] = wrapped;
}

function patchSqlTarget(target: AnyRecord, driver: string) {
  wrapMethod(target, "query", function (this: AnyRecord, args: any[]) {
    const sql = extractSqlFromArgs(args);
    return buildSqlLabel(driver, resolveSqlSource(this), "query", sql);
  });

  wrapMethod(target, "execute", function (this: AnyRecord, args: any[]) {
    const sql = extractSqlFromArgs(args);
    return buildSqlLabel(driver, resolveSqlSource(this), "execute", sql);
  });

  wrapMethod(target, "run", function (this: AnyRecord, args: any[]) {
    const sql = extractSqlFromArgs(args);
    return buildSqlLabel(driver, resolveSqlSource(this), "run", sql);
  });

  wrapMethod(target, "all", function (this: AnyRecord, args: any[]) {
    const sql = extractSqlFromArgs(args);
    return buildSqlLabel(driver, resolveSqlSource(this), "all", sql);
  });

  wrapMethod(target, "get", function (this: AnyRecord, args: any[]) {
    const sql = extractSqlFromArgs(args);
    return buildSqlLabel(driver, resolveSqlSource(this), "get", sql);
  });
}

function patchFactory(moduleObject: AnyRecord, factoryName: string, driver: string) {
  const factory = moduleObject[factoryName];
  if (typeof factory !== "function") return;
  if ((factory as AnyRecord)[WRAPPED]) return;

  const wrappedFactory = function (this: AnyRecord, ...args: any[]) {
    const instance = factory.apply(this, args);

    if (instance && typeof instance === "object") {
      patchSqlTarget(instance as AnyRecord, driver);
      patchPromiseAccessor(instance as AnyRecord, driver);
    }

    return instance;
  };

  (wrappedFactory as AnyRecord)[WRAPPED] = true;
  moduleObject[factoryName] = wrappedFactory;
}

function patchPromiseAccessor(target: AnyRecord, driver: string) {
  const originalPromise = target.promise;
  if (typeof originalPromise !== "function") return;
  if ((originalPromise as AnyRecord)[WRAPPED]) return;

  const wrappedPromise = function (this: AnyRecord, ...args: any[]) {
    const promiseClient = originalPromise.apply(this, args);

    if (promiseClient && typeof promiseClient === "object") {
      patchSqlTarget(promiseClient as AnyRecord, driver);
    }

    return promiseClient;
  };

  (wrappedPromise as AnyRecord)[WRAPPED] = true;
  target.promise = wrappedPromise;
}

function extractSqlFromArgs(args: any[]) {
  return extractSql(args[0]) || extractSql(args[1]);
}

function extractSql(value: unknown) {
  if (typeof value === "string") {
    return normalizeSql(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const input = value as AnyRecord;
  const sql =
    asString(input.sql, "") ||
    asString(input.text, "") ||
    asString(input.query, "") ||
    asString(input.statement, "");

  return sql ? normalizeSql(sql) : "";
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().slice(0, 180);
}

function buildSqlLabel(driver: string, source: string, method: string, sql: string) {
  const base = `sql.${driver}.${source}.${method}`;
  return sql ? `${base}(${sql})` : base;
}

function resolveSqlSource(ctx: AnyRecord) {
  return asString(
    ctx?.database ??
    ctx?.config?.database ??
    ctx?.connectionConfig?.database ??
    ctx?.connectionParameters?.database ??
    ctx?.options?.database ??
    ctx?.connection?.config?.database ??
    ctx?.connection?.database ??
    ctx?.name,
    "default"
  );
}

function isEventEmitterLike(value: unknown): value is { once: AnyFunction } {
  return Boolean(value && typeof (value as AnyRecord).once === "function");
}

function pushDbEvent(startedAt: number, query: string) {
  addEvent({
    type: "db",
    duration: Date.now() - startedAt,
    meta: { query }
  });
}

function safeBuildLabel(
  getLabel: (this: AnyRecord, args: any[]) => string,
  ctx: AnyRecord,
  args: any[],
  fallbackMethod: string
) {
  try {
    const label = getLabel.call(ctx, args);
    return label || `db.${fallbackMethod}`;
  } catch {
    return `db.${fallbackMethod}`;
  }
}

function shortValue(value: unknown) {
  if (value === null) return "null";
  if (value === undefined) return "";

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value).slice(0, 120);
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    const displayed = keys.slice(0, 3).join(", ");
    const suffix = keys.length > 3 ? ", ..." : "";
    return `{${displayed}${suffix}}`;
  }

  return typeof value;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function tryRequireModule(moduleName: string) {
  try {
    const loaded = localRequire(moduleName);
    return (loaded?.default ?? loaded) as AnyRecord;
  } catch {
    return null;
  }
}
