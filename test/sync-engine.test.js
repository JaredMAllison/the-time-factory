// Note: vi.mock() does not intercept CJS require() calls from within CJS modules
// when the test file uses ESM. We use Node's module cache to inject mocks instead.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const dbPath       = require.resolve('../src/backend/db/database');
const enginePath   = require.resolve('../src/backend/sync/engine');
const googlePath   = require.resolve('../src/backend/sync/google');
const nextcloudPath = require.resolve('../src/backend/sync/nextcloud');

let mockGet, mockRun, mockDb, syncGoogle, syncNextcloud;

beforeEach(() => {
  mockGet = vi.fn().mockReturnValue(null);
  mockRun = vi.fn();
  mockDb  = { prepare: vi.fn(() => ({ get: mockGet, run: mockRun })) };
  syncGoogle    = vi.fn().mockResolvedValue({ synced: 0, skipped: 0, errors: [] });
  syncNextcloud = vi.fn().mockResolvedValue({ synced: 0, skipped: 0, errors: [] });

  // Inject mocks into require cache
  require.cache[dbPath]        = { id: dbPath,        filename: dbPath,        loaded: true, exports: mockDb };
  require.cache[googlePath]    = { id: googlePath,    filename: googlePath,    loaded: true, exports: { syncGoogle } };
  require.cache[nextcloudPath] = { id: nextcloudPath, filename: nextcloudPath, loaded: true, exports: { syncNextcloud } };

  // Delete engine so it re-requires with fresh mocked dependencies
  delete require.cache[enginePath];
});

afterEach(() => {
  // Remove injected mocks so they don't leak into other test files
  delete require.cache[enginePath];
  delete require.cache[dbPath];
  delete require.cache[googlePath];
  delete require.cache[nextcloudPath];
});

describe('runSync', () => {
  it('calls no adapters and returns empty results when config is empty', async () => {
    const { runSync } = require('../src/backend/sync/engine');
    const result = await runSync({});
    expect(syncGoogle).not.toHaveBeenCalled();
    expect(syncNextcloud).not.toHaveBeenCalled();
    expect(result.google).toBeNull();
    expect(result.nextcloud).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.syncedAt).toBeTruthy();
  });

  it('calls syncGoogle when google config is present', async () => {
    const { runSync } = require('../src/backend/sync/engine');
    const config = { google: { icalUrl: 'https://example.com/feed.ics' } };
    await runSync(config);
    expect(syncGoogle).toHaveBeenCalledOnce();
    expect(syncGoogle).toHaveBeenCalledWith(mockDb, config);
  });

  it('calls syncNextcloud when nextcloud config is present', async () => {
    const { runSync } = require('../src/backend/sync/engine');
    const config = { nextcloud: { url: 'https://cloud.example.com' } };
    await runSync(config);
    expect(syncNextcloud).toHaveBeenCalledOnce();
    expect(syncNextcloud).toHaveBeenCalledWith(mockDb, config, null);
  });
});

describe('getStatus', () => {
  it('returns null fields when no rows exist in sync_state', () => {
    const { getStatus } = require('../src/backend/sync/engine');
    // mockGet returns null by default (set in beforeEach)
    const status = getStatus();
    expect(status.lastSyncedAt).toBeNull();
    expect(status.lastSyncError).toBeNull();
  });

  it('returns lastSyncedAt and lastSyncError when rows exist', () => {
    mockGet
      .mockReturnValueOnce({ value: '2026-03-25T00:00:00.000Z' })
      .mockReturnValueOnce({ value: 'some error' });
    const { getStatus } = require('../src/backend/sync/engine');
    const status = getStatus();
    expect(status.lastSyncedAt).toBe('2026-03-25T00:00:00.000Z');
    expect(status.lastSyncError).toBe('some error');
  });
});
