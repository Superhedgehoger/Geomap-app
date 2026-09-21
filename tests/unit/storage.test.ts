import { describe, expect, it } from 'vitest';
import {
  PREVIOUS_WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  exportWorkspaceBackup,
  importWorkspaceBackup,
  loadWorkspace,
  saveWorkspace,
  type StorageLike
} from '../../src/storage/workspace-storage';

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

describe('workspace migration', () => {
  it('uses Amap for a new workspace without overriding migrated choices', () => {
    const state = loadWorkspace(memoryStorage());
    expect(state.view.baseLayer).toBe('amap');
  });

  it('imports legacy values without deleting them', () => {
    const storage = memoryStorage({ geomap_custom_groups: '[{"id":"g"}]' });
    const state = loadWorkspace(storage);
    expect(state.legacy.geomap_custom_groups).toEqual([{ id: 'g' }]);
    expect(storage.getItem('geomap_custom_groups')).not.toBeNull();
  });

  it('round-trips a versioned backup', () => {
    const storage = memoryStorage();
    const state = loadWorkspace(storage);
    saveWorkspace(storage, state);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).not.toBeNull();
    expect(importWorkspaceBackup(exportWorkspaceBackup(state))).toEqual(state);
  });

  it('migrates a v1 workspace to v2 without deleting the source', () => {
    const v1 = {
      schemaVersion: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      view: { center: [36, 120], zoom: 10, baseLayer: 'osm' },
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [120, 36] },
          properties: { locationId: 'QD-001', name: '青岛一店', region: '市南区' }
        }
      ],
      groups: [],
      snapshots: [],
      popupConfig: null,
      legacy: {}
    };
    const storage = memoryStorage({ [PREVIOUS_WORKSPACE_STORAGE_KEY]: JSON.stringify(v1) });
    const state = loadWorkspace(storage);
    expect(state.schemaVersion).toBe(2);
    expect(state.locations[0]).toMatchObject({
      locationId: 'QD-001',
      name: '青岛一店',
      region: '市南区'
    });
    expect(storage.getItem(PREVIOUS_WORKSPACE_STORAGE_KEY)).toBe(JSON.stringify(v1));
  });

  it('imports a v1 backup through the same migration path', () => {
    const migrated = importWorkspaceBackup(
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        view: { center: [36, 120], zoom: 10, baseLayer: 'osm' },
        features: [],
        groups: [],
        snapshots: [],
        popupConfig: null,
        legacy: {}
      })
    );
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.audit).toHaveLength(1);
  });

  it('normalizes missing or malformed v2 collection fields', () => {
    const storage = memoryStorage({
      [WORKSPACE_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 2,
        updatedAt: '2026-01-01T00:00:00.000Z',
        features: [],
        records: null,
        savedViews: 'invalid'
      })
    });
    const state = loadWorkspace(storage);
    expect(state.records).toEqual([]);
    expect(state.savedViews).toEqual([]);
    expect(state.selectionModels).toEqual([]);
  });
});
