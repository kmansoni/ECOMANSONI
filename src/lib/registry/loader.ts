/**
 * Registry Loader
 * 
 * Runtime loader for compiled registry.json (SSOT)
 * Provides type-safe access to all registry values
 * 
 * Usage:
 *   import { registry } from "@/lib/registry/loader";
 *   registry.enums.ScopeType.DM
 *   registry.constants.TIMELINE_HARD_CAP_LIMIT
 */

import * as fs from "fs";
import * as path from "path";

export interface CompiledRegistry {
  version: string;
  lastUpdated: string;
  checksumAlgorithm: string;
  checksum: string;
  requiresApproval: boolean;
  codeOwners: string[];
  enums: {
    ScopeType: Record<string, string>;
    JoinMode: Record<string, string>;
    VisibilityLevel: Record<string, string>;
    DeliveryStrategy: Record<string, string>;
    DataClassification: Record<string, string>;
    CommandType: Record<string, string>;
    AdminReasonCode: Record<string, string>;
    MaintenanceMode: Record<string, string>;
    ProjectionMode: Record<string, string>;
  };
  constants: {
    CLASSIFICATION_RETENTION_DAYS: Record<string, number>;
    MAX_CLOCK_SKEW_MS: number;
    TIMELINE_HARD_CAP_LIMIT: number;
    TIMELINE_LOOKBACK_DAYS: number;
    OUTCOME_SLO_HOT_P95_MS: number;
    OUTCOME_SLO_ARCHIVE_P95_MS: number;
    IDEMPOTENCY_HOT_RETENTION_DAYS: number;
    IDEMPOTENCY_ARCHIVE_RETENTION: string;
    SERVICE_KEY_ROTATION_AFTER_DAYS: number;
    SERVICE_KEY_ENFORCEMENT_MAX_AGE_DAYS: number;
    LARGE_CHANNEL_MIN_MEMBER_COUNT: number;
    INVITE_TTL_DEFAULT_HOURS: number;
    INVITE_TTL_MAX_HOURS: number;
  };
  config: {
    policyAffectingFields: string[];
    maintenance: {
      allowedTransitions: Record<string, string[]>;
      forbiddenTransitions: Array<[string, string]>;
    };
    rateLimiting: Record<string, number>;
    rpcFunctions: Record<string, any>;
    queryEndpoints: Record<string, any>;
  };
  guards: Record<string, { name: string; invariant: string; check: string }>;
  tests: Record<string, string[]>;
}

let cachedRegistry: CompiledRegistry | null = null;

/**
 * Load compiled registry from file
 * Cached after first load
 */
function loadRegistry(): CompiledRegistry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  try {
    // In Node.js (including Vitest jsdom), read from file
    const isNodeRuntime =
      typeof process !== "undefined" &&
      !!(process as any).versions?.node;

    if (isNodeRuntime) {
      const registryPath = path.join(process.cwd(), "supabase", "registry.json");
      const content = fs.readFileSync(registryPath, "utf-8");
      cachedRegistry = JSON.parse(content);
      return cachedRegistry;
    }

    // In browser, would need to fetch
    throw new Error("Registry loader not available in browser context");
  } catch (error) {
    throw new Error(`Failed to load registry: ${error}`);
  }
}

/**
 * Get registry instance
 */
export function getRegistry(): CompiledRegistry {
  return loadRegistry();
}

/**
 * Type-safe registry accessor
 */
export const registry = new Proxy({} as CompiledRegistry, {
  get(target, prop) {
    const reg = loadRegistry();
    return (reg as any)[prop];
  },
});

/**
 * Helper: lookup enum value
 */
export function getEnumValue(enumName: keyof CompiledRegistry["enums"], key: string): string | undefined {
  const enum_ = getRegistry().enums[enumName];
  return enum_?.[key];
}

/**
 * Helper: get constant value
 */
export function getConstant<K extends keyof CompiledRegistry["constants"]>(
  constantName: K
): CompiledRegistry["constants"][K] {
  return getRegistry().constants[constantName];
}

/**
 * Helper: check if policy field affects version
 */
export function isPolicyAffectingField(fieldName: string): boolean {
  return getRegistry().config.policyAffectingFields.includes(fieldName);
}

/**
 * Helper: check if maintenance transition is allowed
 */
export function isMaintenanceTransitionAllowed(from: string, to: string): boolean {
  const allowed = getRegistry().config.maintenance.allowedTransitions[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Helper: check if maintenance transition is forbidden
 */
export function isMaintenanceTransitionForbidden(from: string, to: string): boolean {
  return getRegistry().config.maintenance.forbiddenTransitions.some(
    ([f, t]) => f === from && t === to
  );
}

/**
 * Helper: get rate limit for key
 */
export function getRateLimit(key: string): number {
  const limit = (getRegistry().config.rateLimiting as any)[key];
  if (!limit) {
    throw new Error(`Rate limit not found: ${key}`);
  }
  return limit;
}

/**
 * Helper: get retention days for classification
 */
export function getRetentionDays(classification: string): number {
  const days = getRegistry().constants.CLASSIFICATION_RETENTION_DAYS[
    classification as string
  ];
  if (!days) {
    throw new Error(`Retention days not found for classification: ${classification}`);
  }
  return days;
}

/**
 * Helper: get RPC function signature
 */
export function getRpcFunctionSignature(rpcName: string): string | undefined {
  const rpc = (getRegistry().config.rpcFunctions as any)[rpcName];
  return rpc?.signature;
}

/**
 * Helper: get query endpoint signature
 */
export function getQueryEndpointSignature(endpointName: string): string | undefined {
  const endpoint = (getRegistry().config.queryEndpoints as any)[endpointName];
  return endpoint?.signature;
}

/**
 * Helper: get all guards for invariant
 */
export function getGuardsForInvariant(invariantName: string): string[] {
  const guards = getRegistry().guards;
  return Object.entries(guards)
    .filter(([_, guard]) => guard.invariant === invariantName)
    .map(([name, _]) => name);
}

/**
 * Helper: get all tests for guard
 */
export function getTestsForGuard(guardName: string): string[] {
  // This requires manual mapping - for now, return empty
  // Can be extended with a guards-to-tests map in the registry
  return [];
}

/**
 * Registry version info
 */
export function getRegistryVersion(): string {
  return getRegistry().version;
}

export function getRegistryChecksum(): string {
  return getRegistry().checksum;
}

/**
 * Validate registry at startup
 */
export function validateRegistryAtStartup(): boolean {
  try {
    const reg = getRegistry();
    if (!reg.version) {
      console.error("Registry validation failed: missing version");
      return false;
    }
    if (!reg.checksum) {
      console.error("Registry validation failed: missing checksum");
      return false;
    }
    console.log(`✓ Registry v${reg.version} loaded (checksum: ${reg.checksum.slice(0, 8)}...)`);
    return true;
  } catch (error) {
    console.error("Registry validation failed:", error);
    return false;
  }
}
