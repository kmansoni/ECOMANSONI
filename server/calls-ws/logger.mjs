function serializeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeValue(nestedValue)])
    );
  }

  return value;
}

function normalizeArgs(arg1, arg2) {
  if (typeof arg1 === "string") {
    return [{}, arg1];
  }

  if (arg1 instanceof Error) {
    return [{ error: serializeValue(arg1) }, typeof arg2 === "string" ? arg2 : arg1.message];
  }

  if (arg1 && typeof arg1 === "object") {
    return [serializeValue(arg1), typeof arg2 === "string" ? arg2 : undefined];
  }

  if (arg1 == null) {
    return [{}, typeof arg2 === "string" ? arg2 : undefined];
  }

  return [{ value: serializeValue(arg1) }, typeof arg2 === "string" ? arg2 : String(arg1)];
}

function writeLog(level, bindings, arg1, arg2) {
  const [fields, msg] = normalizeArgs(arg1, arg2);
  const line = {
    level,
    time: new Date().toISOString(),
    ...bindings,
    ...fields,
  };

  if (msg) {
    line.msg = msg;
  }

  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  writer(JSON.stringify(line));
}

export function createLogger(bindings = {}) {
  return {
    child(extraBindings = {}) {
      return createLogger({ ...bindings, ...extraBindings });
    },
    info(arg1, arg2) {
      writeLog("info", bindings, arg1, arg2);
    },
    warn(arg1, arg2) {
      writeLog("warn", bindings, arg1, arg2);
    },
    error(arg1, arg2) {
      writeLog("error", bindings, arg1, arg2);
    },
  };
}

export const logger = createLogger({ service: "calls-ws" });
