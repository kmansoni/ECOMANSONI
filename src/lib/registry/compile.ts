/**
 * Registry Compiler
 * 
 * Converts TypeScript registry types into compiled JSON SSOT
 * Output: supabase/registry.json
 * 
 * Usage: npm run registry:compile
 * Verification: npm run registry:verify
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// Import all types from registry/types.ts
import {
  ScopeType,
  JoinMode,
  VisibilityLevel,
  DeliveryStrategy,
  DataClassification,
  CLASSIFICATION_RETENTION_DAYS,
  CommandType,
  AdminReasonCode,
  MaintenanceMode,
  MAINTENANCE_ALLOWED_TRANSITIONS,
  MAINTENANCE_FORBIDDEN_TRANSITIONS,
  ProjectionMode,
  MAX_CLOCK_SKEW_MS,
  TIMELINE_HARD_CAP_LIMIT,
  TIMELINE_LOOKBACK_DAYS,
  OUTCOME_SLO_HOT_P95_MS,
  OUTCOME_SLO_ARCHIVE_P95_MS,
  IDEMPOTENCY_HOT_RETENTION_DAYS,
  IDEMPOTENCY_ARCHIVE_RETENTION,
  SERVICE_KEY_ROTATION_AFTER_DAYS,
  SERVICE_KEY_ENFORCEMENT_MAX_AGE_DAYS,
  LARGE_CHANNEL_MIN_MEMBER_COUNT,
  INVITE_TTL_DEFAULT_HOURS,
  INVITE_TTL_MAX_HOURS,
  POLICY_AFFECTING_FIELDS,
  ALLOWED_RPC_FUNCTIONS,
  ALLOWED_QUERY_ENDPOINTS,
  RATE_LIMIT_CONFIG,
  ACCEPTANCE_TEST_CATEGORIES,
  RUNTIME_GUARDS,
  REGISTRY_VERSION,
  REGISTRY_LAST_UPDATED,
  REGISTRY_REQUIRES_APPROVAL,
  REGISTRY_CODEOWNERS,
} from "../../schemas/registry/types";

interface CompiledRegistry {
  version: string;
  lastUpdated: string;
  checksumAlgorithm: "sha256-jcs"; // JSON Canonicalization Scheme (RFC 8785)
  checksum: string;
  requiresApproval: boolean;
  codeOwners: string[];
  enums: Record<string, Record<string, string>>;
  constants: Record<string, unknown>;
  config: Record<string, unknown>;
  guards: typeof RUNTIME_GUARDS;
  tests: typeof ACCEPTANCE_TEST_CATEGORIES;
}

/**
 * RFC 8785 JSON Canonicalization Scheme (simplified for key ordering)
 * For full JCS, use a library; here we use basic object key sorting
 */
function sortObjectKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, any> = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Compile registry into JSON format
 */
function compileRegistry(): CompiledRegistry {
  const registryData = {
    enums: {
      ScopeType,
      JoinMode,
      VisibilityLevel,
      DeliveryStrategy,
      DataClassification,
      CommandType,
      AdminReasonCode,
      MaintenanceMode,
      ProjectionMode,
    },
    constants: {
      CLASSIFICATION_RETENTION_DAYS,
      MAX_CLOCK_SKEW_MS,
      TIMELINE_HARD_CAP_LIMIT,
      TIMELINE_LOOKBACK_DAYS,
      OUTCOME_SLO_HOT_P95_MS,
      OUTCOME_SLO_ARCHIVE_P95_MS,
      IDEMPOTENCY_HOT_RETENTION_DAYS,
      IDEMPOTENCY_ARCHIVE_RETENTION,
      SERVICE_KEY_ROTATION_AFTER_DAYS,
      SERVICE_KEY_ENFORCEMENT_MAX_AGE_DAYS,
      LARGE_CHANNEL_MIN_MEMBER_COUNT,
      INVITE_TTL_DEFAULT_HOURS,
      INVITE_TTL_MAX_HOURS,
    },
    config: {
      policyAffectingFields: POLICY_AFFECTING_FIELDS,
      maintenance: {
        allowedTransitions: MAINTENANCE_ALLOWED_TRANSITIONS,
        forbiddenTransitions: MAINTENANCE_FORBIDDEN_TRANSITIONS,
      },
      rateLimiting: RATE_LIMIT_CONFIG,
      rpcFunctions: ALLOWED_RPC_FUNCTIONS,
      queryEndpoints: ALLOWED_QUERY_ENDPOINTS,
    },
  };

  // Sort for consistent hashing
  const sorted = sortObjectKeys(registryData);
  const registryJson = JSON.stringify(sorted, null, 2);

  // Compute checksum
  const checksum = crypto.createHash("sha256").update(registryJson).digest("hex");

  const compiled: CompiledRegistry = {
    version: REGISTRY_VERSION,
    lastUpdated: REGISTRY_LAST_UPDATED,
    checksumAlgorithm: "sha256-jcs",
    checksum,
    requiresApproval: REGISTRY_REQUIRES_APPROVAL,
    codeOwners: REGISTRY_CODEOWNERS,
    ...sorted,
    guards: RUNTIME_GUARDS,
    tests: ACCEPTANCE_TEST_CATEGORIES,
  };

  return compiled;
}

/**
 * Write compiled registry to file
 */
function writeCompiledRegistry(registry: CompiledRegistry, outputPath: string) {
  const registryJson = JSON.stringify(registry, null, 2);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, registryJson, "utf-8");
  console.log(`✓ Registry compiled to ${outputPath}`);
  console.log(`  Version: ${registry.version}`);
  console.log(`  Checksum: ${registry.checksum}`);
  console.log(`  Requires approval: ${registry.requiresApproval}`);
}

/**
 * Main entry point
 */
function main() {
  try {
    const compiled = compileRegistry();
    const outputPath = path.join(process.cwd(), "supabase", "registry.json");
    writeCompiledRegistry(compiled, outputPath);
    process.exit(0);
  } catch (error) {
    console.error("Registry compilation failed:", error);
    process.exit(1);
  }
}

// Call main for CLI execution
main();

export { compileRegistry, writeCompiledRegistry, CompiledRegistry };
