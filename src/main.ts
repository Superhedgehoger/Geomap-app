import { createAppConfig } from './config';
import { DecisionShell } from './app/decision-shell';
import { mountEditorNavigation } from './app/editor-navigation';
import './app/editor-navigation.css';
import { HistoryWorkspace } from './app/history-workspace';
import { SelectionWorkspace } from './app/selection-workspace';
import { DataWorkspace } from './app/data-workspace';
import { CollaborationWorkspace } from './app/collaboration-workspace';
import { CollaborationApiClient } from './collaboration/api-client';
import './app/decision-shell.css';
import './app/history-workspace.css';
import './app/selection-workspace.css';
import './app/data-workspace.css';
import './app/collaboration-workspace.css';
import './app/legacy-menu-theme.css';
import { importGeoJson, exportGeoJson, toSafeSpreadsheetRows } from './io/geojson';
import { sanitizeHtml, sanitizeUrl, neutralizeSpreadsheetFormula } from './security';
import { GeomapFeatureStore } from './store/feature-store';
import { GeomapRecordStore } from './store/record-store';
import { GeomapSelectionStore } from './store/selection-store';
import { GeomapMetricStore } from './store/metric-store';
import {
  exportWorkspaceBackup,
  importWorkspaceBackup,
  loadWorkspace,
  saveWorkspace
} from './storage/workspace-storage';

const REQUIRED_CONTROLS = ['map', 'controls', 'layerPanel'] as const;
const OPTIONAL_CONTROLS = [
  'btn-show-layer-panel',
  'exportSinglePageBtn',
  'toggleTableBtn'
] as const;

function syncNetworkStatus(): void {
  document.body.classList.toggle('is-offline', !navigator.onLine);
  document.body.dataset.networkStatus = navigator.onLine ? 'online' : 'offline';
}

function queryControls(): Readonly<Record<string, HTMLElement | null>> {
  return Object.freeze(
    Object.fromEntries(
      [...REQUIRED_CONTROLS, ...OPTIONAL_CONTROLS].map((id) => [id, document.getElementById(id)])
    )
  );
}

export function bootstrapApp(): void {
  const controls = queryControls();
  const missingRequired = REQUIRED_CONTROLS.filter((id) => !controls[id]);
  if (missingRequired.length > 0) {
    console.error(
      `[Geomap bootstrap] Missing required controls: ${missingRequired.map((id) => `#${id}`).join(', ')}`
    );
    document.documentElement.dataset.geomapCore = 'error';
    return;
  }

  const config = createAppConfig({
    explicitVariant: window.GEOMAP_VARIANT,
    privateApiUrl: window.GEOMAP_PRIVATE_API_URL
  });
  const workspace = loadWorkspace(window.localStorage);
  const store = new GeomapFeatureStore(workspace);
  store.subscribe((nextState) => saveWorkspace(window.localStorage, nextState));
  const recordStore = new GeomapRecordStore(store, config.capabilities.eventTracker);
  const selectionStore = new GeomapSelectionStore(store);
  const metricStore = new GeomapMetricStore(store, recordStore);
  const collaborationClient = config.privateApiUrl
    ? new CollaborationApiClient(config.privateApiUrl)
    : null;

  const syncFeatures = (value: unknown): void => {
    const result = importGeoJson(value, config.variant);
    if (result.errors.length > 0 && result.imported === 0) return;
    store.setFeatures(result.collection.features);
    recordStore.importLegacy(store.getState().locations);
  };

  window.addEventListener('online', syncNetworkStatus);
  window.addEventListener('offline', syncNetworkStatus);
  syncNetworkStatus();

  window.GEOMAP_VARIANT = config.variant;
  window.GEOMAP_FEATURES = Object.freeze({ eventTracker: config.capabilities.eventTracker });
  window.GeomapCore = Object.freeze({
    config,
    store,
    recordStore,
    selectionStore,
    metricStore,
    collaborationClient,
    importGeoJson,
    exportGeoJson,
    toSafeSpreadsheetRows,
    sanitizeHtml,
    sanitizeUrl,
    neutralizeSpreadsheetFormula,
    exportWorkspaceBackup: () => exportWorkspaceBackup(store.getState()),
    importWorkspaceBackup: (value: string) => store.replace(importWorkspaceBackup(value)),
    syncFeatures
  });

  document.documentElement.dataset.geomapCore = 'v3';
  window.addEventListener('geomap:features-changed', (event) => {
    syncFeatures((event as CustomEvent<unknown>).detail);
  });
  const initialLegacyCollection = window.GeomapLegacyBridge?.getFeatureCollection();
  if (initialLegacyCollection?.features.length) syncFeatures(initialLegacyCollection);
  new DecisionShell(
    store,
    config.capabilities.eventTracker,
    config.capabilities.siteSelection,
    config.capabilities.businessData,
    config.capabilities.privateCollaboration
  ).mount();
  new HistoryWorkspace(store, recordStore).mount();
  new SelectionWorkspace(store, selectionStore).mount();
  new DataWorkspace(store, metricStore).mount();
  new CollaborationWorkspace(store, collaborationClient).mount();
  mountEditorNavigation();
}

bootstrapApp();
