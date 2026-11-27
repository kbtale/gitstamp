import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAppInstallation, createPublicRepo } from '../github-api';
import { setStoredToken, getStoredToken } from '../auth-pkce';

describe('github-api auth and installation checks', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const store = new Map<string, string>();
    const storageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear()
    };
    vi.stubGlobal('sessionStorage', storageMock);
    vi.stubGlobal('localStorage', storageMock);
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    });
    vi.stubGlobal('CustomEvent', class CustomEvent {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('keeps auth token intact on 403 integration errors and only clears on 401', async () => {
    setStoredToken('ghu_valid_token');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'Resource not accessible by integration' })
    } as Response);

    await expect(createPublicRepo('ghu_valid_token', 'gitstamp-art')).rejects.toThrow(
      'Resource not accessible by integration'
    );
    expect(getStoredToken()).toBe('ghu_valid_token');
    expect((window.dispatchEvent as any)).not.toHaveBeenCalled();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Bad credentials' })
    } as Response);

    await expect(createPublicRepo('ghu_valid_token', 'gitstamp-art')).rejects.toThrow(
      'Bad credentials'
    );
    expect(getStoredToken()).toBeNull();
    expect((window.dispatchEvent as any)).toHaveBeenCalledTimes(1);
  });

  it('detects whether the GitStamp GitHub App is installed for the user account', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        total_count: 1,
        installations: [{ id: 123, account: { login: 'kbtale' } }]
      })
    } as Response);

    await expect(checkAppInstallation('ghu_token', 'kbtale')).resolves.toBe(true);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        total_count: 0,
        installations: []
      })
    } as Response);

    await expect(checkAppInstallation('ghu_token', 'kbtale')).resolves.toBe(false);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500
    } as Response);

    await expect(checkAppInstallation('ghu_token', 'kbtale')).resolves.toBeNull();
  });
});
