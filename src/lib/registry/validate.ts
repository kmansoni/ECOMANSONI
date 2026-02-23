/**
 * Registry Validator
 * 
 * Runtime validation of compiled registry.json
 * Used by CI gate: registry-verify
 * 
 * Checks:
 * 1. All required enums present
 * 2. Checksum integrity
 * 3. Maintenance transition graph consistency
 * 4. Policy affecting fields known
 * 5. All guards mapped to invariants
 * 6. All tests categorized
 * 7. Rate limits sane (non-zero)
 * 8. SLO targets realistic
 * 
 * Usage: npm run registry:verify
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

interface CompiledRegistry {
  version: string;
  checksum: string;
  checksumAlgorithm: string;
  requiresApproval: boolean;
  enums: Record<string, Record<string, string>>;
  constants: Record<string, unknown>;
  config: Record<string, unknown>;
  guards: Record<string, { invariant: string }>;
  tests: Record<string, string[]>;
}

interface ValidationError {
  severity: "error" | "warn";
  code: string;
  message: string;
}

/**
 * Load compiled registry
 */
function loadRegistry(registryPath: string): CompiledRegistry {
  try {
    const content = fs.readFileSync(registryPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load registry from ${registryPath}: ${error}`);
  }
}

/**
 * RFC 8785 JSON Canonicalization (simplified)
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
 * Verify checksum integrity
 */
function verifyChecksum(registry: CompiledRegistry): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!registry.checksum) {
    errors.push({
      severity: "error",
      code: "CHECKSUM_MISSING",
      message: "Registry missing checksum field",
    });
    return errors;
  }

  // Reconstruct checksum (excluding the checksum field itself)
  const { checksum: _, ...registryWithoutChecksum } = registry;
  const sorted = sortObjectKeys(registryWithoutChecksum);
  const registryJson = JSON.stringify(sorted);
  const computedChecksum = crypto
    .createHash("sha256")
    .update(registryJson)
    .digest("hex");

    if (computedChecksum !== registry.checksum) {
    errors.push({
      severity: "error",
      code: "CHECKSUM_MISMATCH",
      message: `Checksum mismatch: expected ${registry.checksum}, got ${computedChecksum}`,
    });
  }

  return errors;
}

/**
 * Validate required enums
 */
function validateEnums(registry: CompiledRegistry): ValidationError[] {
  const errors: ValidationError[] = [];
  const requiredEnums = [
    "ScopeType",
    "JoinMode",
    "VisibilityLevel",
    "DeliveryStrategy",
    "DataClassification",
    "CommandType",
    "AdminReasonCode",
    "MaintenanceMode",
    "ProjectionMode",
  ];

  for (const enumName of requiredEnums) {
    if (!registry.enums[enumName]) {
      errors.push({
        severity: "error",
        code: "ENUM_MISSING",
        message: `Missing enum: ${enumName}`,
      });
    }
  }

  // Validate specific enum values
  const scopeTypes = registry.enums.ScopeType;
  if (scopeTypes && !scopeTypes.DM) {
    errors.push({
      severity: "error",
      code: "SCOPE_TYPE_INVALID",
      message: "ScopeType.DM is required",
    });
  }

  return errors;
}

/**
 * Validate maintenance transition graph
 */
function validateMaintenanceTransitions(registry: CompiledRegistry): ValidationError[] {
  const errors: ValidationError[] = [];

  const config = registry.config as any;
  if (!config.maintenance) {
    errors.push({
      severity: "error",
      code: "MAINTENANCE_CONFIG_MISSING",
      message: "Missing maintenance config",
    });
    return errors;
  }

  const { allowedTransitions, forbiddenTransitions } = config.maintenance;

  // Verify no transition is both allowed and forbidden
  if (forbiddenTransitions && allowedTransitions) {
    for (const [from, to] of forbiddenTransitions) {
      const allowed = allowedTransitions[from] || [];
      if (allowed.includes(to)) {
        errors.push({
          severity: "error",
          code: "TRANSITION_CONFLICT",
          message: `Transition ${from} -> ${to} is both allowed and forbidden`,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate guard-to-invariant mapping
 */
function validateGuardMapping(registry: CompiledRegistry): ValidationError[] {
  const errors: ValidationError[] = [];

  const expectedGuards = [
    "G_IDEMP_01",
    "G_IDEMP_02",
    "G_POL_01",
    "G_SEQ_01",
    "G_QRY_01",
    "G_MAINT_01",
    "G_INV_01",
    "G_DEL_01",
    "G_CLK_01",
    "G_ADM_01",
    "G_BATCH_01",
    "G_PROJ_01",
    "G_ARC_01",
  ];

  for (const guardName of expectedGuards) {
    if (!registry.guards[guardName]) {
      errors.push({
        severity: "error",
        code: "GUARD_MISSING",
        message: `Missing guard: ${guardName}`,
      });
    }
  }

  // Verify each guard maps to an invariant
  for (const [guardName, guard] of Object.entries(registry.guards)) {
    if (!guard.invariant) {
      errors.push({
        severity: "error",
        code: "GUARD_INVARIANT_MISSING",
        message: `Guard ${guardName} missing invariant mapping`,
      });
    }
  }

  return errors;
}

/**
 * Validate test categorization
 */
function validateTestCategorization(registry: CompiledRegistry): ValidationError[] {
  const errors: ValidationError[] = [];

  const requiredCategories = [
    "DM",
    "IDEMPOTENCY",
    "POLICY",
    "QUERY",
    "SEQUENCE",
    "AUDIT",
    "INVITES",
    "DELIVERY",
    "MIGRATION",
    "PROJECTION",
    "GOVERNANCE",
    "BATCH",
    "CHAOS",
  ];

  for (const category of requiredCategories) {
    if (!registry.tests[category]) {
      errors.push({
        severity: "error",
        code: "TEST_CATEGORY_MISSING",
        message: `Missing test category: ${category}`,
      });
    }
  }

  // Verify BATCH category has at least T-BATCH-01
  const batchTests = registry.tests.BATCH || [];
  if (!batchTests.includes("T-BATCH-01")) {
    errors.push({
      severity: "error",
      code: "BATCH_TEST_MISSING",
      message: "T-BATCH-01 is required in BATCH category",
    });
  }

  return errors;
}

/**
 * Validate rate limits are sane
 */
function validateRateLimits(registry: CompiledRegistry): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = registry.config as any;
  const rateLimits = config.rateLimiting as any;

  if (!rateLimits) {
    errors.push({
      severity: "error",
      code: "RATE_LIMIT_CONFIG_MISSING",
      message: "Missing rate limit config",
    });
    return errors;
  }

  // All limits must be > 0
  const limits = [
    "timeline_per_scope",
    "timeline_per_actor_global",
    "timeline_per_device",
    "timeline_per_service",
    "cmd_per_actor",
    "cmd_per_device",
    "cmd_per_service",
    "maintenance_per_hour",
  ];

  for (const limit of limits) {
    const value = rateLimits[limit];
    if (!value || value <= 0) {
      errors.push({
        severity: "error",
        code: "RATE_LIMIT_INVALID",
        message: `Rate limit ${limit} must be > 0, got ${value}`,
      });
    }
  }

  return errors;
}

/**
 * Validate SLO targets
 */
function validateSLOTargets(registry: CompiledRegistry): ValidationError[] {
  const errors: ValidationError[] = [];
  const constants = registry.constants as any;

  const hotp95 = constants.OUTCOME_SLO_HOT_P95_MS;
  const archivep95 = constants.OUTCOME_SLO_ARCHIVE_P95_MS;

  if (!hotp95 || hotp95 <= 0) {
    errors.push({
      severity: "error",
      code: "HOT_SLO_INVALID",
      message: `Hot outcome SLO must be > 0ms, got ${hotp95}`,
    });
  }

  if (!archivep95 || archivep95 <= 0) {
    errors.push({
      severity: "error",
      code: "ARCHIVE_SLO_INVALID",
      message: `Archive outcome SLO must be > 0ms, got ${archivep95}`,
    });
  }

  if (hotp95 && archivep95 && hotp95 >= archivep95) {
    errors.push({
      severity: "warn",
      code: "SLO_ORDERING",
      message: `Hot SLO (${hotp95}ms) should be less than archive SLO (${archivep95}ms)`,
    });
  }

  return errors;
}

/**
 * Run all validations
 */
function validateRegistry(registry: CompiledRegistry): ValidationError[] {
  const errors: ValidationError[] = [];

  errors.push(...verifyChecksum(registry));
  errors.push(...validateEnums(registry));
  errors.push(...validateMaintenanceTransitions(registry));
  errors.push(...validateGuardMapping(registry));
  errors.push(...validateTestCategorization(registry));
  errors.push(...validateRateLimits(registry));
  errors.push(...validateSLOTargets(registry));

  return errors;
}

/**
 * Report validation results
 */
function reportValidation(errors: ValidationError[]) {
  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warnCount = errors.filter((e) => e.severity === "warn").length;

  if (errors.length === 0) {
    console.log("✓ Registry validation passed");
    return true;
  }

  console.log(`\nRegistry validation failed: ${errorCount} errors, ${warnCount} warnings\n`);

  for (const error of errors) {
    const symbol = error.severity === "error" ? "✗" : "⚠";
    console.log(`${symbol} [${error.code}] ${error.message}`);
  }

  return errorCount === 0;
}

/**
 * Main entry point
 */
function main() {
  try {
    const registryPath = path.join(process.cwd(), "supabase", "registry.json");
    const registry = loadRegistry(registryPath);
    const errors = validateRegistry(registry);
    const passed = reportValidation(errors);
    process.exit(passed ? 0 : 1);
  } catch (error) {
    console.error("Registry validation error:", error);
    process.exit(1);
  }
}

// Call main for CLI execution
main();

export { validateRegistry, reportValidation };
