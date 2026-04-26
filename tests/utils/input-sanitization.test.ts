/**
 * Input Sanitization Tests
 * Verifies sanitizeString passes through content without false-positive rejections.
 * Pattern-based content filtering was removed because it blocked legitimate task
 * content (e.g. "#137", "CREATE table", "curl", "ssh", "format").
 * Vikunja's own API handles XSS/injection protection on the server side.
 */

import {
  sanitizeString,
  validateValue,
  safeJsonParse
} from '../../src/utils/validation';
import { sanitizeLogData } from '../../src/utils/security';

describe('Input Sanitization Tests', () => {
  describe('sanitizeString passes through legitimate content', () => {
    it('should accept normal task titles', () => {
      expect(sanitizeString('Fix bug in login page')).toBe('Fix bug in login page');
    });

    it('should accept titles with hash references', () => {
      expect(sanitizeString('Blocked by #137 — needs research queue first')).toBe(
        'Blocked by #137 — needs research queue first'
      );
    });

    it('should accept titles with technical terms', () => {
      expect(sanitizeString('Create infra-engineer agent for deployments')).toBe(
        'Create infra-engineer agent for deployments'
      );
    });

    it('should accept descriptions mentioning CLI tools', () => {
      expect(sanitizeString('Run curl to test the endpoint, then ssh into the box')).toBe(
        'Run curl to test the endpoint, then ssh into the box'
      );
    });

    it('should accept descriptions with SQL keywords in prose', () => {
      expect(sanitizeString('Create a new table, then insert seed data and select results')).toBe(
        'Create a new table, then insert seed data and select results'
      );
    });

    it('should accept descriptions with code snippets', () => {
      expect(sanitizeString('Use `rm -rf node_modules` to clean up')).toBe(
        'Use `rm -rf node_modules` to clean up'
      );
    });

    it('should accept descriptions with dashes and comments syntax', () => {
      expect(sanitizeString('Option A -- better performance; Option B -- simpler code')).toBe(
        'Option A -- better performance; Option B -- simpler code'
      );
    });

    it('should reject strings exceeding max length', () => {
      const longString = 'a'.repeat(1001);
      expect(() => sanitizeString(longString)).toThrow('exceeds maximum length');
    });

    it('should reject non-string input', () => {
      expect(() => sanitizeString(42 as unknown as string)).toThrow('Value must be a string');
    });
  });

  describe('validateValue still enforces type constraints', () => {
    it('should accept string arrays', () => {
      expect(validateValue(['Task 1', 'Task 2'])).toEqual(['Task 1', 'Task 2']);
    });

    it('should reject mixed-type arrays', () => {
      expect(() => validateValue([1, 'two', 3])).toThrow();
    });

    it('should limit array size to prevent DoS', () => {
      const largeArray = new Array(101).fill('test');
      expect(() => validateValue(largeArray)).toThrow('cannot exceed 100 elements');
    });
  });

  describe('JSON security', () => {
    it('should prevent prototype pollution in JSON', () => {
      const pollutedJson = '{"__proto__": {"isAdmin": true}}';
      expect(() => safeJsonParse(pollutedJson)).toThrow(
        'contains potentially dangerous prototype pollution patterns'
      );
    });
  });

  describe('Integration with credential masking', () => {
    it('should pass through content while masking credentials', () => {
      const mixedContent = {
        title: 'Deploy the new CREATE TABLE migration',
        api_token: 'sk-secret123456789'
      };

      const sanitized = sanitizeLogData(mixedContent) as Record<string, unknown>;
      expect(sanitized.title).toBe('Deploy the new CREATE TABLE migration');
      expect(sanitized.api_token).toBe('[REDACTED]');
    });
  });
});
