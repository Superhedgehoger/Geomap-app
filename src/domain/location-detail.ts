import { resolveRecordRevisions } from './history';
import type {
  BusinessRecord,
  CandidateSelectionResult,
  JsonValue,
  LocationEntity,
  MetricDefinition,
  SelectionDecisionState,
  SelectionScenarioState,
  WorkspaceState
} from '../types';

export interface LocationMetricDetail {
  metricKey: string;
  name: string;
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  target: number | null;
  targetRate: number | null;
  unit: string;
  format: MetricDefinition['format'];
  period: string;
  observations: number;
}

export interface LocationSelectionDetail {
  scenario: SelectionScenarioState;
  result: CandidateSelectionResult;
  decision: SelectionDecisionState | null;
}

export interface LocationDetailViewModel {
  location: LocationEntity;
  metrics: LocationMetricDetail[];
  timeline: BusinessRecord[];
  selection: LocationSelectionDetail[];
  dataCompleteness: number;
  missingFields: string[];
  recordCount: number;
}

function time(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function number(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function metricDetails(
  records: readonly BusinessRecord[],
  definitions: readonly MetricDefinition[]
): LocationMetricDetail[] {
  const definitionsByKey = new Map(definitions.map((item) => [item.metricKey, item]));
  const groups = new Map<string, BusinessRecord[]>();
  records
    .filter(
      (record) =>
        record.recordType === 'metric' &&
        text(record.payload.metricKey) !== null &&
        number(record.payload.value) !== null
    )
    .forEach((record) => {
      const key = text(record.payload.metricKey)!;
      groups.set(key, [...(groups.get(key) ?? []), record]);
    });

  return [...groups.entries()]
    .map(([metricKey, values]) => {
      const ordered = values.sort((left, right) => time(right.validFrom) - time(left.validFrom));
      const latest = ordered[0]!;
      const current = number(latest.payload.value)!;
      const previous = ordered[1] ? number(ordered[1].payload.value) : null;
      const target = number(latest.payload.target);
      const definition = definitionsByKey.get(metricKey);
      return {
        metricKey,
        name: definition?.name ?? metricKey,
        value: current,
        previousValue: previous,
        changePercent:
          previous !== null && previous !== 0
            ? ((current - previous) / Math.abs(previous)) * 100
            : null,
        target,
        targetRate: target !== null && target !== 0 ? (current / target) * 100 : null,
        unit: text(latest.payload.unit) ?? definition?.unit ?? '',
        format: definition?.format ?? 'number',
        period: text(latest.payload.periodStart) ?? latest.validFrom,
        observations: ordered.length
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

function selectionDetails(
  locationId: string,
  scenarios: readonly SelectionScenarioState[],
  decisions: readonly SelectionDecisionState[]
): LocationSelectionDetail[] {
  return scenarios
    .flatMap((scenario) => {
      const result = scenario.results.find((item) => item.locationId === locationId);
      if (!result) return [];
      return [
        {
          scenario,
          result,
          decision:
            decisions.find(
              (item) =>
                item.scenarioId === scenario.scenarioId && item.recommendedLocationId === locationId
            ) ?? null
        }
      ];
    })
    .sort(
      (left, right) =>
        time(right.scenario.completedAt ?? right.scenario.createdAt) -
        time(left.scenario.completedAt ?? left.scenario.createdAt)
    );
}

export function buildLocationDetail(
  state: Pick<
    WorkspaceState,
    'locations' | 'records' | 'metricDefinitions' | 'selectionScenarios' | 'decisions'
  >,
  locationId: string
): LocationDetailViewModel | null {
  const location = state.locations.find((item) => item.locationId === locationId);
  if (!location) return null;
  const records = resolveRecordRevisions(state.records)
    .filter((record) => record.entityRefs.includes(locationId))
    .sort((left, right) => time(right.validFrom) - time(left.validFrom));
  const required = [
    ['区域', location.region],
    ['地址', location.address],
    ['位置坐标', location.geometry],
    ['开业/计划日期', location.openedAt ?? location.attributes.plannedAt]
  ] as const;
  const missingFields = required.filter(([, value]) => !value).map(([label]) => label);
  const selection = selectionDetails(locationId, state.selectionScenarios, state.decisions);
  const metrics = metricDetails(records, state.metricDefinitions);
  const filledFields = required.length - missingFields.length;
  return {
    location,
    metrics,
    timeline: records.filter((record) => record.recordType !== 'metric'),
    selection,
    dataCompleteness: Math.round((filledFields / required.length) * 100),
    missingFields,
    recordCount: records.length
  };
}
