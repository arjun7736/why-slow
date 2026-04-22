import { createRequire } from "node:module";
import { addEvent } from "../store";

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

  patched = true;
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
    "bulkWrite",
    "aggregate"
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
