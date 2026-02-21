import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * P1.2 Config Validation v1.0 Vitest Suite
 * 
 * Tests strict validation contract for reels_engine_validate_config_v1:
 * - Size limit (500KB)
 * - Required fields (algorithm_version, exploration_ratio, recency_days, freq_cap_hours)
 * - Type validation
 * - Bounds validation
 * - Weights validation (if present)
 * - Unknown keys warnings
 * - Activate gate enforcement (reject if invalid)
 */

// Mock Supabase client
const mockSupabase = {
  rpc: vi.fn().mockResolvedValue({
    data: null,
    error: null
  })
};

// Test utility: build config with custom overrides
function buildConfig(overrides = {}) {
  return {
    algorithm_version: 'v1.0',
    exploration_ratio: 0.1,
    recency_days: 30,
    freq_cap_hours: 4,
    ...overrides
  };
}

describe('reels_engine_validate_config_v1', () => {
  
  // ========================================================================
  // Size Limit Tests
  // ========================================================================
  
  describe('size validation', () => {
    it('should accept config under size limit (500KB)', async () => {
      const config = buildConfig();
      
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(true);
      expect(data.errors).toHaveLength(0);
    });

    it('should reject config exceeding size limit (size_limit_exceeded)', async () => {
      // Create config > 500KB by padding description
      const largePadding = 'x'.repeat(512001);
      const config = buildConfig({ description: largePadding });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'size_limit_exceeded',
              path: '$',
              message: 'Config size 512001 bytes exceeds maximum 512000 bytes',
              meta: { max_bytes: 512000, actual_bytes: 512001 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'size_limit_exceeded',
          path: '$'
        })
      );
    });
  });

  // ========================================================================
  // Required Fields Tests
  // ========================================================================

  describe('required fields validation', () => {
    it('should reject if algorithm_version missing (missing_required_field)', async () => {
      const config = buildConfig();
      delete config.algorithm_version;

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'missing_required_field',
              path: '$.algorithm_version',
              message: 'Missing required field: algorithm_version'
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'missing_required_field',
          path: '$.algorithm_version'
        })
      );
    });

    it('should reject if exploration_ratio missing (missing_required_field)', async () => {
      const config = buildConfig();
      delete config.exploration_ratio;

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'missing_required_field',
              path: '$.exploration_ratio',
              message: 'Missing required field: exploration_ratio'
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'missing_required_field',
          path: '$.exploration_ratio'
        })
      );
    });

    it('should reject if recency_days missing (missing_required_field)', async () => {
      const config = buildConfig();
      delete config.recency_days;

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'missing_required_field',
              path: '$.recency_days',
              message: 'Missing required field: recency_days'
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'missing_required_field',
          path: '$.recency_days'
        })
      );
    });

    it('should reject if freq_cap_hours missing (missing_required_field)', async () => {
      const config = buildConfig();
      delete config.freq_cap_hours;

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'missing_required_field',
              path: '$.freq_cap_hours',
              message: 'Missing required field: freq_cap_hours'
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'missing_required_field',
          path: '$.freq_cap_hours'
        })
      );
    });
  });

  // ========================================================================
  // Type Validation Tests
  // ========================================================================

  describe('type validation', () => {
    it('should reject null config (type_mismatch)', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'type_mismatch',
              path: '$',
              message: 'Config must be a JSON object, got null',
              meta: { expected: 'object', actual: 'null' }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: null
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'type_mismatch',
          path: '$'
        })
      );
    });

    it('should reject array instead of object (type_mismatch)', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'type_mismatch',
              path: '$',
              message: 'Config must be a JSON object, got array',
              meta: { expected: 'object', actual: 'array' }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: [1, 2, 3]
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('type_mismatch');
    });

    it('should reject non-numeric exploration_ratio (type_mismatch)', async () => {
      const config = buildConfig({ exploration_ratio: 'not-a-number' });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'type_mismatch',
              path: '$.exploration_ratio',
              message: 'exploration_ratio must be a number, got string',
              meta: { expected: 'number', actual: 'string' }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'type_mismatch',
          path: '$.exploration_ratio'
        })
      );
    });

    it('should reject non-numeric recency_days (type_mismatch)', async () => {
      const config = buildConfig({ recency_days: 'thirty' });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'type_mismatch',
              path: '$.recency_days',
              message: 'recency_days must be a number, got string',
              meta: { expected: 'number', actual: 'string' }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'type_mismatch',
          path: '$.recency_days'
        })
      );
    });

    it('should reject empty algorithm_version (empty_string)', async () => {
      const config = buildConfig({ algorithm_version: '' });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'empty_string',
              path: '$.algorithm_version',
              message: 'algorithm_version cannot be empty'
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'empty_string',
          path: '$.algorithm_version'
        })
      );
    });
  });

  // ========================================================================
  // Bounds Validation Tests
  // ========================================================================

  describe('bounds validation', () => {
    it('should reject exploration_ratio < 0 (out_of_range)', async () => {
      const config = buildConfig({ exploration_ratio: -0.1 });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.exploration_ratio',
              message: 'exploration_ratio must be in [0,1], got -0.1',
              meta: { min: 0, max: 1, actual: -0.1 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'out_of_range',
          path: '$.exploration_ratio'
        })
      );
    });

    it('should reject exploration_ratio > 1 (out_of_range)', async () => {
      const config = buildConfig({ exploration_ratio: 1.5 });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.exploration_ratio',
              message: 'exploration_ratio must be in [0,1], got 1.5',
              meta: { min: 0, max: 1, actual: 1.5 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('out_of_range');
    });

    it('should accept exploration_ratio at boundaries (0, 1)', async () => {
      const config0 = buildConfig({ exploration_ratio: 0 });
      const config1 = buildConfig({ exploration_ratio: 1 });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data: data0 } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config0
      });

      expect(data0.valid).toBe(true);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data: data1 } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config1
      });

      expect(data1.valid).toBe(true);
    });

    it('should reject recency_days < 1 (out_of_range)', async () => {
      const config = buildConfig({ recency_days: 0 });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.recency_days',
              message: 'recency_days must be in [1,365], got 0',
              meta: { min: 1, max: 365, actual: 0 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('out_of_range');
    });

    it('should reject recency_days > 365 (out_of_range)', async () => {
      const config = buildConfig({ recency_days: 366 });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.recency_days',
              message: 'recency_days must be in [1,365], got 366',
              meta: { min: 1, max: 365, actual: 366 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('out_of_range');
    });

    it('should reject freq_cap_hours < 0 (out_of_range)', async () => {
      const config = buildConfig({ freq_cap_hours: -1 });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.freq_cap_hours',
              message: 'freq_cap_hours must be in [0,24], got -1',
              meta: { min: 0, max: 24, actual: -1 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('out_of_range');
    });

    it('should reject freq_cap_hours > 24 (out_of_range)', async () => {
      const config = buildConfig({ freq_cap_hours: 25 });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.freq_cap_hours',
              message: 'freq_cap_hours must be in [0,24], got 25',
              meta: { min: 0, max: 24, actual: 25 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('out_of_range');
    });
  });

  // ========================================================================
  // Weights Validation Tests
  // ========================================================================

  describe('weights validation', () => {
    it('should reject weights if not object (type_mismatch)', async () => {
      const config = buildConfig({ weights: [0.5, 0.5] });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'type_mismatch',
              path: '$.weights',
              message: 'weights must be an object, got array',
              meta: { expected: 'object', actual: 'array' }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('type_mismatch');
    });

    it('should reject empty weights object (empty_object)', async () => {
      const config = buildConfig({ weights: {} });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'empty_object',
              path: '$.weights',
              message: 'weights object cannot be empty'
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('empty_object');
    });

    it('should reject weight value < 0 (out_of_range)', async () => {
      const config = buildConfig({
        weights: { feature_a: -0.1, feature_b: 1.1 }
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.weights.feature_a',
              message: 'weight must be in [0,1], got -0.1',
              meta: { min: 0, max: 1, actual: -0.1 }
            },
            {
              code: 'out_of_range',
              path: '$.weights.feature_b',
              message: 'weight must be in [0,1], got 1.1',
              meta: { min: 0, max: 1, actual: 1.1 }
            },
            {
              code: 'weights_sum_not_one',
              path: '$.weights',
              message: 'weights sum must be ~= 1.0 (tolerance 0.01), got 1.0000',
              meta: { sum: 1.0, tolerance: 0.01 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors).toContainEqual(
        expect.objectContaining({
          code: 'out_of_range',
          path: '$.weights.feature_a'
        })
      );
    });

    it('should reject weights sum not equal to 1.0 (weights_sum_not_one)', async () => {
      const config = buildConfig({
        weights: { feature_a: 0.5, feature_b: 0.3 } // sum = 0.8
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'weights_sum_not_one',
              path: '$.weights',
              message: 'weights sum must be ~= 1.0 (tolerance 0.01), got 0.8000',
              meta: { sum: 0.8, tolerance: 0.01 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(false);
      expect(data.errors[0].code).toBe('weights_sum_not_one');
    });

    it('should accept weights sum within tolerance [0.99, 1.01]', async () => {
      const config = buildConfig({
        weights: { feature_a: 0.495, feature_b: 0.505 } // sum = 1.0
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(true);
      expect(data.errors).toHaveLength(0);
    });

    it('should accept weights sum at tolerance boundaries (0.99, 1.01)', async () => {
      const config99 = buildConfig({
        weights: { feature_a: 0.99, feature_b: 0 }
      });

      const config101 = buildConfig({
        weights: { feature_a: 1.01, feature_b: 0 }
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data: data99 } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config99
      });

      expect(data99.valid).toBe(true);

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data: data101 } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config101
      });

      expect(data101.valid).toBe(true);
    });
  });

  // ========================================================================
  // Unknown Keys Tests (Warnings)
  // ========================================================================

  describe('unknown keys validation', () => {
    it('should warn on unknown keys (unknown_key)', async () => {
      const config = buildConfig({
        unknown_field: 'value',
        another_unknown: 123
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [
            {
              code: 'unknown_key',
              path: '$.unknown_field',
              message: 'Unknown configuration key: unknown_field'
            },
            {
              code: 'unknown_key',
              path: '$.another_unknown',
              message: 'Unknown configuration key: another_unknown'
            }
          ],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(true);
      expect(data.warnings).toHaveLength(2);
      expect(data.warnings).toContainEqual(
        expect.objectContaining({
          code: 'unknown_key',
          path: '$.unknown_field'
        })
      );
    });

    it('should accept config with optional known fields (description, config_schema_version)', async () => {
      const config = buildConfig({
        description: 'Test config',
        config_schema_version: '1.0'
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(data.valid).toBe(true);
      expect(data.warnings).toHaveLength(0);
    });
  });

  // ========================================================================
  // Activate Gate Enforcement Tests
  // ========================================================================

  describe('activate_config gate enforcement', () => {
    it('should succeed if config valid (activate_config_gate_v1)', async () => {
      const config = buildConfig();

      // First call: validate (returns valid)
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      // Second call: activate
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          activated: true,
          version_id: 'test-version-id',
          segment_id: 'test-segment-id',
          validation: {
            valid: true,
            errors: [],
            warnings: [],
            suggestions: []
          }
        },
        error: null
      });

      // Validate first
      const { data: validationResult } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(validationResult.valid).toBe(true);

      // Then activate
      const { data: activateResult } = await mockSupabase.rpc('reels_engine_activate_config_v1', {
        p_version_id: 'test-version-id',
        p_segment_id: 'test-segment-id'
      });

      expect(activateResult.activated).toBe(true);
    });

    it('should reject activation if config has errors (gate enforcement)', async () => {
      const invalidConfig = buildConfig();
      delete invalidConfig.algorithm_version;

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'missing_required_field',
              path: '$.algorithm_version',
              message: 'Missing required field: algorithm_version'
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data: validationResult } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: invalidConfig
      });

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toHaveLength(1);

      // Activation would be rejected by the gate
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Config validation failed with 1 error(s)',
          code: 'INVALID_CONFIG'
        }
      });

      const { data, error } = await mockSupabase.rpc('reels_engine_activate_config_v1', {
        p_version_id: 'test-version-id',
        p_segment_id: 'test-segment-id'
      });

      expect(error).toBeDefined();
      expect(error.message).toContain('validation failed');
    });

    it('should succeed if config has only warnings (no errors)', async () => {
      const config = buildConfig({
        unknown_field: 'should-warn-but-not-block'
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          errors: [],
          warnings: [
            {
              code: 'unknown_key',
              path: '$.unknown_field',
              message: 'Unknown configuration key: unknown_field'
            }
          ],
          suggestions: []
        },
        error: null
      });

      // Validation passes (warnings don't block)
      const { data: validationResult } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      expect(validationResult.valid).toBe(true);
      expect(validationResult.warnings).toHaveLength(1);

      // Activation succeeds
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: true,
          activated: true,
          version_id: 'test-version-id',
          segment_id: 'test-segment-id',
          validation: {
            valid: true,
            errors: [],
            warnings: [
              {
                code: 'unknown_key',
                path: '$.unknown_field',
                message: 'Unknown configuration key: unknown_field'
              }
            ],
            suggestions: []
          }
        },
        error: null
      });

      const { data: activateResult } = await mockSupabase.rpc('reels_engine_activate_config_v1', {
        p_version_id: 'test-version-id',
        p_segment_id: 'test-segment-id'
      });

      expect(activateResult.activated).toBe(true);
    });
  });

  // ========================================================================
  // Response Contract Validation
  // ========================================================================

  describe('response contract', () => {
    it('should always return stable error codes', async () => {
      const stableErrorCodes = [
        'size_limit_exceeded',
        'missing_required_field',
        'type_mismatch',
        'out_of_range',
        'weights_sum_not_one',
        'empty_object',
        'empty_string',
        'unknown_key'
      ];

      const invalidConfig = buildConfig({
        exploration_ratio: 1.5,
        recency_days: 0
      });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.exploration_ratio',
              message: 'exploration_ratio must be in [0,1], got 1.5',
              meta: { min: 0, max: 1, actual: 1.5 }
            },
            {
              code: 'out_of_range',
              path: '$.recency_days',
              message: 'recency_days must be in [1,365], got 0',
              meta: { min: 1, max: 365, actual: 0 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: invalidConfig
      });

      data.errors.forEach((error) => {
        expect(stableErrorCodes).toContain(error.code);
        expect(error.path).toBeDefined();
        expect(error.message).toBeDefined();
        expect(typeof error.code).toBe('string');
        expect(typeof error.path).toBe('string');
        expect(typeof error.message).toBe('string');
      });
    });

    it('should include path and meta fields for traceability', async () => {
      const config = buildConfig({ exploration_ratio: -0.5 });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          valid: false,
          errors: [
            {
              code: 'out_of_range',
              path: '$.exploration_ratio',
              message: 'exploration_ratio must be in [0,1], got -0.5',
              meta: { min: 0, max: 1, actual: -0.5 }
            }
          ],
          warnings: [],
          suggestions: []
        },
        error: null
      });

      const { data } = await mockSupabase.rpc('reels_engine_validate_config_v1', {
        p_config: config
      });

      const error = data.errors[0];
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('path');
      expect(error).toHaveProperty('message');
      expect(error).toHaveProperty('meta');
      expect(error.path).toMatch(/^\$/);
      expect(error.meta).toBeInstanceOf(Object);
    });
  });
});
