import { describe, expect, it } from 'vitest';
import { buildLocationDetail } from '../../src/domain/location-detail';
import { createEmptyWorkspace } from '../../src/storage/workspace-storage';

describe('location 360 detail', () => {
  it('combines latest metrics, history and selection evidence for one location', () => {
    const workspace = createEmptyWorkspace('2026-09-30T00:00:00Z');
    workspace.locations = [
      {
        locationId: 'store-a',
        name: '青岛一店',
        kind: 'candidate',
        status: 'planned',
        region: '市南区',
        address: '香港中路 1 号',
        openedAt: '2026-10-01',
        geometry: { type: 'Point', coordinates: [120.38, 36.06] },
        attributes: {}
      }
    ];
    workspace.metricDefinitions = [
      {
        metricKey: 'revenue',
        name: '营业额',
        unit: '万元',
        periodicity: 'month',
        aggregation: 'sum',
        format: 'currency',
        description: ''
      }
    ];
    workspace.records = [
      {
        recordId: 'm1',
        recordType: 'metric',
        title: '8 月营业额',
        validFrom: '2026-08-01',
        recordedAt: '2026-08-31',
        entityRefs: ['store-a'],
        status: 'confirmed',
        confidence: 'confirmed',
        payload: { metricKey: 'revenue', value: 80, target: 100, periodStart: '2026-08-01' },
        tags: []
      },
      {
        recordId: 'm2',
        recordType: 'metric',
        title: '9 月营业额',
        validFrom: '2026-09-01',
        recordedAt: '2026-09-30',
        entityRefs: ['store-a'],
        status: 'confirmed',
        confidence: 'confirmed',
        payload: { metricKey: 'revenue', value: 100, target: 120, periodStart: '2026-09-01' },
        tags: []
      },
      {
        recordId: 'event-1',
        recordType: 'event',
        title: '完成商圈调研',
        validFrom: '2026-09-15',
        recordedAt: '2026-09-15',
        entityRefs: ['store-a'],
        status: 'confirmed',
        confidence: 'confirmed',
        payload: {},
        tags: []
      }
    ];
    workspace.selectionScenarios = [
      {
        scenarioId: 'scenario-1',
        name: '青岛候选点比较',
        modelId: 'model-1',
        modelVersion: 1,
        candidateIds: ['store-a'],
        assumptions: {},
        results: [
          {
            locationId: 'store-a',
            name: '青岛一店',
            score: 86,
            eligible: true,
            completeness: 100,
            eliminatedReasons: [],
            contributions: []
          }
        ],
        status: 'completed',
        createdAt: '2026-09-20',
        completedAt: '2026-09-21'
      }
    ];

    const detail = buildLocationDetail(workspace, 'store-a');
    expect(detail?.metrics[0]).toMatchObject({
      name: '营业额',
      value: 100,
      previousValue: 80,
      changePercent: 25,
      targetRate: 100 / 1.2
    });
    expect(detail?.timeline.map((item) => item.title)).toEqual(['完成商圈调研']);
    expect(detail?.selection[0]?.result.score).toBe(86);
    expect(detail?.dataCompleteness).toBe(100);
  });

  it('returns null for an unknown location and reports missing basic data', () => {
    const workspace = createEmptyWorkspace();
    workspace.locations = [
      {
        locationId: 'incomplete',
        name: '待补录门店',
        kind: 'store',
        status: 'unknown',
        geometry: null,
        attributes: {}
      }
    ];
    expect(buildLocationDetail(workspace, 'missing')).toBeNull();
    expect(buildLocationDetail(workspace, 'incomplete')?.missingFields).toEqual([
      '区域',
      '地址',
      '位置坐标',
      '开业/计划日期'
    ]);
  });
});
