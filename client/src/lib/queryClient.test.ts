import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setAdminUserId, getStoredAdminUserId } from './queryClient';

const ADMIN_KEY = "cardscan.admin.userId";

describe('Admin User ID Storage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('setAdminUserId', () => {
    it('should set the admin user ID in localStorage when a positive integer is provided', () => {
      setAdminUserId(123);
      expect(localStorage.getItem(ADMIN_KEY)).toBe('123');
    });

    it('should remove the admin user ID from localStorage when null is provided', () => {
      localStorage.setItem(ADMIN_KEY, '123');
      setAdminUserId(null);
      expect(localStorage.getItem(ADMIN_KEY)).toBeNull();
    });

    it('should not throw if localStorage is unavailable', () => {
      // Mock localStorage to throw an error
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage is not available');
      });

      expect(() => setAdminUserId(123)).not.toThrow();

      mockSetItem.mockRestore();
    });
  });

  describe('getStoredAdminUserId', () => {
    it('should retrieve the admin user ID from localStorage as a number', () => {
      localStorage.setItem(ADMIN_KEY, '456');
      const result = getStoredAdminUserId();
      expect(result).toBe(456);
      expect(typeof result).toBe('number');
    });

    it('should return null if there is no admin user ID in localStorage', () => {
      const result = getStoredAdminUserId();
      expect(result).toBeNull();
    });

    it('should return null if localStorage throws an error', () => {
      // Mock localStorage to throw an error
      const mockGetItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage is not available');
      });

      const result = getStoredAdminUserId();
      expect(result).toBeNull();

      mockGetItem.mockRestore();
    });

    it('should return NaN if localStorage contains a non-numeric string', () => {
        // According to current implementation parseInt("abc", 10) returns NaN.
        // It's technically truthy in current code 'v ? parseInt(v, 10) : null'
        localStorage.setItem(ADMIN_KEY, 'abc');
        const result = getStoredAdminUserId();
        expect(result).toBeNaN();
    })
  });
});
