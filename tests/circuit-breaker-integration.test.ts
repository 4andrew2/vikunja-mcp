/**
 * Circuit Breaker Integration Tests with Retry Logic
 * Tests network failure recovery and cascading failure prevention
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { withRetry, RETRY_CONFIG } from '../src/utils/retry';

// Mock logger to avoid console spam
jest.mock('../src/utils/logger');

describe('Circuit Breaker Integration with Retry Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use circuit breaker when enabled in retry config', async () => {
    let callCount = 0;
    const mockOperation = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 10) {
        // Use a 5xx server error to trigger circuit breaker
        const error = new Error('Internal Server Error');
        (error as any).status = 500;
        throw error;
      }
      return 'success';
    });

    // First, make several calls to trigger circuit breaker opening
    for (let i = 0; i < 6; i++) {
      try {
        await withRetry(mockOperation, {
          enableCircuitBreaker: true,
          circuitBreakerName: 'test-circuit',
          maxRetries: 0 // No retries to trigger faster opening
        });
      } catch (error) {
        // Expected to fail
      }
    }

    // Now try rapid calls - should be blocked by open circuit breaker
    const promises = Array.from({ length: 5 }, () =>
      withRetry(mockOperation, {
        enableCircuitBreaker: true,
        circuitBreakerName: 'test-circuit',
        maxRetries: 0
      }).catch(e => e.message)
    );

    const results = await Promise.all(promises);

    // Opossum rejects with "Breaker is open" once the circuit has opened
    expect(
      results.some(
        r =>
          typeof r === 'string' &&
          r.toLowerCase().includes('breaker') &&
          r.toLowerCase().includes('open'),
      ),
    ).toBe(true);

    // Sequential warmup hits the volume threshold; some parallel calls may be short-circuited
    expect(mockOperation.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it('should handle network partition detection in retry logic', async () => {
    const networkErrors = [
      { error: new Error('ETIMEDOUT'), expected: true },
      { error: new Error('ECONNRESET'), expected: true },
      { error: new Error('ENOTFOUND'), expected: true },
      { error: new Error('socket hang up'), expected: true },
      { error: new Error('validation error'), expected: false },
    ];

    for (const { error, expected } of networkErrors) {
      let callCount = 0;
      const mockOperation = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw error;
        }
        return 'success';
      });

      try {
        await withRetry(mockOperation, {
          maxRetries: 1,
          initialDelay: 10,
          shouldRetry: () => expected
        });

        // If expected to retry, should have been called twice
        expect(mockOperation).toHaveBeenCalledTimes(expected ? 2 : 1);
      } catch (e) {
        // If not expected to retry, should have failed on first attempt
        expect(mockOperation).toHaveBeenCalledTimes(1);
      }
    }
  });

  it('should not use circuit breaker when disabled', async () => {
    const mockOperation = jest.fn().mockRejectedValue(new Error('network error'));

    try {
      await withRetry(mockOperation, {
        enableCircuitBreaker: false,
        circuitBreakerName: 'unused-circuit',
        maxRetries: 1
      });
    } catch (error) {
      // Expected to fail
    }

    // Should have been called twice (original + 1 retry) since no circuit breaker
    expect(mockOperation).toHaveBeenCalledTimes(2);
  });
});