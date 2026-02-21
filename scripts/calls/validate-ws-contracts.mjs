import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";
import Redis from "ioredis";

const repoRoot = path.resolve(process.cwd());
const schemasDir = path.join(repoRoot, "docs", "calls", "schemas");
const machinesDir = path.join(repoRoot, "docs", "calls", "machines");

function listFilesRecursive(dir, predicate) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(p, predicate));
    else if (!predicate || predicate(p)) out.push(p);
  }
  return out;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function readYaml(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return YAML.parse(raw);
}

async function requireRedisIfNeeded() {
  if (process.env.CALLS_REDIS_REQUIRED !== "1") return;

  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

  const timeoutMs = Number(process.env.CALLS_VALIDATE_REDIS_TIMEOUT_MS ?? "1500");
  let firstError = null;

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: timeoutMs,
    retryStrategy: () => null,
  });

  // Must subscribe before connect() to avoid noisy "Unhandled error event".
  // Do not log here to keep CI output deterministic (we log once in catch).
  redis.on("error", (err) => {
    if (!firstError) firstError = err;
  });

  let t;
  try {
    const timed = new Promise((_, reject) => {
      t = setTimeout(() => reject(new Error(`Redis ping timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    await Promise.race([redis.connect().then(() => redis.ping()), timed]);
    clearTimeout(t);
    return;
  } catch (err) {
    clearTimeout(t);
    const e = firstError ?? err;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[calls:validate] FAIL: CALLS_REDIS_REQUIRED=1 but cannot connect to Redis (${redisUrl}): ${msg}`);
    process.exitCode = 1;
  } finally {
    try {
      await redis.quit();
    } catch {}
    try {
      redis.disconnect();
    } catch {}
  }

  process.exit(1);
}

async function main() {
  await requireRedisIfNeeded();

  if (!fs.existsSync(schemasDir)) {
    throw new Error(`Missing schemas dir: ${schemasDir}`);
  }
  if (!fs.existsSync(machinesDir)) {
    throw new Error(`Missing machines dir: ${machinesDir}`);
  }

  const schemaFiles = listFilesRecursive(schemasDir, (p) => p.endsWith(".schema.json"));
  if (schemaFiles.length === 0) {
    throw new Error(`No schema files found in: ${schemasDir}`);
  }

  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    validateSchema: true,
  });
  addFormats(ajv);

  const schemas = [];
  for (const f of schemaFiles) {
    const s = readJson(f);
    if (!s.$id) {
      throw new Error(`Schema missing $id: ${path.relative(repoRoot, f)}`);
    }
    schemas.push(s);
  }

  // Add all schemas first so $ref by $id can resolve.
  for (const s of schemas) {
    ajv.addSchema(s, s.$id);
  }

  // Compile all schemas to ensure refs resolve.
  for (const s of schemas) {
    try {
      ajv.getSchema(s.$id) ?? ajv.compile(s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to compile schema ${s.$id}: ${msg}`);
    }
  }

  const machineFiles = listFilesRecursive(machinesDir, (p) => p.endsWith(".yaml") || p.endsWith(".yml"));
  if (machineFiles.length === 0) {
    throw new Error(`No machine YAML files found in: ${machinesDir}`);
  }

  for (const f of machineFiles) {
    const m = readYaml(f);
    if (!m || typeof m !== "object") {
      throw new Error(`Invalid YAML (not an object): ${path.relative(repoRoot, f)}`);
    }
    if (!m.machine || typeof m.machine !== "string") {
      throw new Error(`Machine YAML missing 'machine' string: ${path.relative(repoRoot, f)}`);
    }
    if (!m.initial || typeof m.initial !== "string") {
      throw new Error(`Machine YAML missing 'initial' string: ${path.relative(repoRoot, f)}`);
    }
    if (!m.states || typeof m.states !== "object") {
      throw new Error(`Machine YAML missing 'states' object: ${path.relative(repoRoot, f)}`);
    }
  }

  console.log(`[calls:validate] OK: ${schemaFiles.length} schemas, ${machineFiles.length} machines`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
