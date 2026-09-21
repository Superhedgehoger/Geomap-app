import { deriveLocationsFromFeatures } from '../domain/locations';
import type {
  GeoJsonFeature,
  JsonValue,
  MapViewState,
  SnapshotState,
  WorkspaceState
} from '../types';

export const WORKSPACE_STORAGE_KEY = 'geomap.workspace.v2';
export const PREVIOUS_WORKSPACE_STORAGE_KEY = 'geomap.workspace.v1';
const LEGACY_KEYS = [
  'geomap_custom_groups',
  'geomap_snapshots',
  'geomap_popup_config',
  'map_events_data',
  'archive_list',
  'code_archive_list'
] as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface WorkspaceStateV1 {
  schemaVersion: 1;
  updatedAt: string;
  view: MapViewState;
  features: GeoJsonFeature[];
  groups: JsonValue[];
  snapshots: SnapshotState[];
  popupConfig: JsonValue | null;
  legacy: Record<string, JsonValue>;
}

export function createEmptyWorkspace(now = new Date().toISOString()): WorkspaceState {
  return {
    schemaVersion: 2,
    updatedAt: now,
    view: { center: [36.0671, 120.3826], zoom: 12, baseLayer: 'amap' },
    features: [],
    locations: [],
    areas: [],
    records: [],
    metricDefinitions: [],
    eventSeries: [],
    selectionModels: [],
    selectionScenarios: [],
    decisions: [],
    savedViews: [],
    dataSources: [],
    audit: [],
    groups: [],
    snapshots: [],
    popupConfig: null,
    legacy: {}
  };
}

function migrateV1Workspace(value: Partial<WorkspaceStateV1>): WorkspaceState {
  const workspace = createEmptyWorkspace(value.updatedAt);
  const features = Array.isArray(value.features) ? structuredClone(value.features) : [];
  return {
    ...workspace,
    view: value.view ?? workspace.view,
    features,
    locations: deriveLocationsFromFeatures(features),
    groups: Array.isArray(value.groups) ? structuredClone(value.groups) : [],
    snapshots: Array.isArray(value.snapshots) ? structuredClone(value.snapshots) : [],
    popupConfig: value.popupConfig ?? null,
    legacy: { ...(value.legacy ?? {}), [PREVIOUS_WORKSPACE_STORAGE_KEY]: value as JsonValue },
    audit: [
      {
        type: 'workspace-migration',
        from: 1,
        to: 2,
        migratedAt: new Date().toISOString()
      }
    ]
  };
}

function normalizeV2Workspace(value: Partial<WorkspaceState>): WorkspaceState {
  const empty = createEmptyWorkspace(value.updatedAt);
  const features = Array.isArray(value.features) ? structuredClone(value.features) : [];
  const array = <T>(candidate: T[] | undefined): T[] =>
    Array.isArray(candidate) ? structuredClone(candidate) : [];
  return {
    ...empty,
    ...structuredClone(value),
    schemaVersion: 2,
    features,
    locations: Array.isArray(value.locations)
      ? structuredClone(value.locations)
      : deriveLocationsFromFeatures(features),
    areas: array(value.areas),
    records: array(value.records),
    metricDefinitions: array(value.metricDefinitions),
    eventSeries: array(value.eventSeries),
    selectionModels: array(value.selectionModels),
    selectionScenarios: array(value.selectionScenarios),
    decisions: array(value.decisions),
    savedViews: array(value.savedViews),
    dataSources: array(value.dataSources),
    audit: array(value.audit),
    groups: array(value.groups),
    snapshots: array(value.snapshots),
    legacy:
      value.legacy && typeof value.legacy === 'object' && !Array.isArray(value.legacy)
        ? structuredClone(value.legacy)
        : {}
  } as WorkspaceState;
}

function parseLegacy(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

export function migrateLegacyWorkspace(storage: StorageLike): WorkspaceState {
  const workspace = createEmptyWorkspace();
  for (const key of LEGACY_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) workspace.legacy[key] = parseLegacy(value);
  }
  return workspace;
}

export function loadWorkspace(storage: StorageLike): WorkspaceState {
  const stored = storage.getItem(WORKSPACE_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<WorkspaceState>;
      if (parsed.schemaVersion === 2) return normalizeV2Workspace(parsed);
    } catch {
      // Fall through to the non-destructive v1 and legacy migration paths.
    }
  }

  const previous = storage.getItem(PREVIOUS_WORKSPACE_STORAGE_KEY);
  if (previous) {
    try {
      const parsed = JSON.parse(previous) as Partial<WorkspaceStateV1>;
      if (parsed.schemaVersion === 1) return migrateV1Workspace(parsed);
    } catch {
      // Fall through to legacy-key collection.
    }
  }
  return migrateLegacyWorkspace(storage);
}

export function saveWorkspace(storage: StorageLike, workspace: WorkspaceState): void {
  storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

export function exportWorkspaceBackup(workspace: WorkspaceState): string {
  return JSON.stringify(workspace, null, 2);
}

export function importWorkspaceBackup(value: string): WorkspaceState {
  const parsed = JSON.parse(value) as Partial<WorkspaceState> | Partial<WorkspaceStateV1>;
  if (parsed.schemaVersion === 1 && Array.isArray(parsed.features)) {
    return migrateV1Workspace(parsed as Partial<WorkspaceStateV1>);
  }
  if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.features)) {
    throw new Error('Unsupported or invalid Geomap workspace backup.');
  }
  return normalizeV2Workspace(parsed as Partial<WorkspaceState>);
}
