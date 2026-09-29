import { buildLocationDetail, type LocationMetricDetail } from '../domain/location-detail';
import type { GeomapFeatureStore } from '../store/feature-store';
import type { BusinessRecord, LocationEntity } from '../types';

const STATUS: Record<LocationEntity['status'], string> = {
  planned: '计划',
  preparing: '筹备',
  open: '在营',
  paused: '停业',
  closed: '闭店',
  unknown: '未知'
};
const KIND: Record<LocationEntity['kind'], string> = {
  store: '门店',
  candidate: '候选点',
  competitor: '竞品',
  warehouse: '仓库',
  other: '位置'
};
const RECORD: Record<BusinessRecord['recordType'], string> = {
  event: '经营事件',
  metric: '经营数据',
  'state-change': '状态变化',
  plan: '经营计划',
  decision: '决策记录'
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function date(value: string | undefined): string {
  if (!value) return '未填写';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : parsed.toLocaleDateString('zh-CN');
}

function number(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
}

function metricCard(metric: LocationMetricDetail): string {
  const change = metric.changePercent;
  const target = metric.targetRate;
  return `<article class="location-detail-metric"><span>${escapeHtml(metric.name)}</span><strong>${number(metric.value)}<small>${escapeHtml(metric.unit)}</small></strong><div><em>${escapeHtml(metric.period.slice(0, 10))}</em><em class="${change !== null && change < 0 ? 'is-negative' : ''}">${change === null ? '无上期数据' : `环比 ${change > 0 ? '+' : ''}${number(change)}%`}</em><em>${target === null ? '未设目标' : `目标达成 ${number(target)}%`}</em></div></article>`;
}

export class LocationDetailWorkspace {
  readonly #store: GeomapFeatureStore;
  readonly #recordEnabled: boolean;
  readonly #selectionEnabled: boolean;
  #root: HTMLElement | null = null;
  #locationId: string | null = null;
  #returnFocus: HTMLElement | null = null;
  #historicalState: { at: string; locations: LocationEntity[]; records: BusinessRecord[] } | null =
    null;

  constructor(store: GeomapFeatureStore, recordEnabled: boolean, selectionEnabled: boolean) {
    this.#store = store;
    this.#recordEnabled = recordEnabled;
    this.#selectionEnabled = selectionEnabled;
  }

  mount(): void {
    if (document.getElementById('locationDetail')) return;
    this.#root = document.createElement('aside');
    this.#root.id = 'locationDetail';
    this.#root.className = 'location-detail';
    this.#root.setAttribute('role', 'dialog');
    this.#root.setAttribute('aria-modal', 'false');
    this.#root.setAttribute('aria-label', '位置 360° 详情');
    this.#root.hidden = true;
    document.body.append(this.#root);
    window.addEventListener('geomap:open-location-detail', (event) => {
      const detail = (event as CustomEvent<{ locationId?: string; name?: string }>).detail;
      const locations = this.#historicalState?.locations ?? this.#store.getState().locations;
      const location =
        locations.find((item) => item.locationId === detail?.locationId) ??
        locations.find((item) => item.name === detail?.name);
      if (!location) return;
      this.#returnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.#locationId = location.locationId;
      this.#render();
      this.#root?.querySelector<HTMLButtonElement>('[data-close-detail]')?.focus();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.#locationId) this.#close();
    });
    window.addEventListener('geomap:history-state-changed', (event) => {
      const detail = (
        event as CustomEvent<{
          at?: string;
          locations?: LocationEntity[] | null;
          records?: BusinessRecord[];
        }>
      ).detail;
      this.#historicalState =
        detail?.at && detail.locations && detail.records
          ? { at: detail.at, locations: detail.locations, records: detail.records }
          : null;
      if (this.#locationId) this.#render();
    });
    this.#store.subscribe(() => {
      if (this.#locationId) this.#render();
    });
  }

  #close(): void {
    this.#locationId = null;
    if (this.#root) this.#root.hidden = true;
    document.body.classList.remove('location-detail-open');
    if (this.#returnFocus?.isConnected) this.#returnFocus.focus();
  }

  #render(): void {
    if (!this.#root || !this.#locationId) return;
    const current = this.#store.getState();
    const state = {
      ...current,
      records: this.#recordEnabled
        ? (this.#historicalState?.records ?? current.records)
        : (this.#historicalState?.records ?? current.records).filter(
            (record) => record.recordType === 'metric'
          ),
      locations: this.#historicalState?.locations ?? current.locations,
      selectionScenarios:
        this.#selectionEnabled && !this.#historicalState ? current.selectionScenarios : [],
      decisions: this.#selectionEnabled && !this.#historicalState ? current.decisions : []
    };
    const detail = buildLocationDetail(state, this.#locationId);
    if (!detail) {
      this.#close();
      return;
    }
    const { location, metrics, timeline, selection } = detail;
    this.#root.hidden = false;
    document.body.classList.add('location-detail-open');
    this.#root.innerHTML = `
      <header class="location-detail-header"><div><span>${KIND[location.kind] ?? '位置'} 360°详情${this.#historicalState ? ` · 历史状态 ${date(this.#historicalState.at)}` : ''}</span><h2>${escapeHtml(location.name)}</h2><p><em data-status="${escapeHtml(location.status)}">${STATUS[location.status] ?? '未知'}</em>${escapeHtml(location.region ?? '未分区')} · ${escapeHtml(location.brand ?? '未设置品牌')}</p></div><button type="button" data-close-detail aria-label="关闭位置详情"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="location-detail-scroll">
        <div class="location-detail-actions"><button type="button" data-locate-detail><i class="fa-solid fa-location-crosshairs"></i> 地图定位</button>${this.#recordEnabled ? '<button type="button" data-add-detail-record><i class="fa-solid fa-plus"></i> 新增记录</button>' : ''}</div>
        <section aria-label="基本资料"><h3>基本资料</h3><dl><div><dt>地址</dt><dd>${escapeHtml(location.address ?? '未填写')}</dd></div><div><dt>开业/计划日期</dt><dd>${date(location.openedAt ?? (typeof location.attributes.plannedAt === 'string' ? location.attributes.plannedAt : undefined))}</dd></div><div><dt>记录数</dt><dd>${detail.recordCount} 条</dd></div></dl><p class="location-detail-quality">资料完整度 ${detail.dataCompleteness}%${detail.missingFields.length ? ` · 待补 ${detail.missingFields.map(escapeHtml).join('、')}` : ''}</p></section>
        <section aria-label="经营表现"><div class="location-detail-section-head"><h3>经营表现</h3><button type="button" data-detail-section="data">查看经营数据</button></div><div class="location-detail-metrics">${metrics.length ? metrics.map(metricCard).join('') : '<p class="location-detail-empty">暂无经营指标。可从经营数据中心导入。</p>'}</div></section>
        ${
          this.#recordEnabled
            ? `<section aria-label="历史记录"><div class="location-detail-section-head"><h3>历史记录</h3><button type="button" data-detail-section="history">查看历史复盘</button></div><ol class="location-detail-timeline">${
                timeline.length
                  ? timeline
                      .slice(0, 8)
                      .map(
                        (record) =>
                          `<li><time>${date(record.validFrom)}</time><span>${RECORD[record.recordType]}</span><strong>${escapeHtml(record.title)}</strong>${record.status === 'draft' ? '<em>草稿</em>' : ''}</li>`
                      )
                      .join('')
                  : '<li class="location-detail-empty">暂无关联事件或决策记录。</li>'
              }</ol></section>`
            : ''
        }
        ${
          this.#selectionEnabled && !this.#historicalState
            ? `<section aria-label="选址依据"><div class="location-detail-section-head"><h3>选址依据</h3><button type="button" data-detail-section="selection">查看选址分析</button></div>${
                selection.length
                  ? selection
                      .slice(0, 3)
                      .map(
                        ({ scenario, result, decision }) =>
                          `<article class="location-detail-scenario"><strong>${escapeHtml(scenario.name)}</strong><b>${number(result.score)} 分</b><p>${result.eligible ? '符合准入条件' : `未通过：${result.eliminatedReasons.map(escapeHtml).join('、')}`}${decision ? ` · 已记录推荐：${escapeHtml(decision.conclusion)}` : ''}</p></article>`
                      )
                      .join('')
                  : '<p class="location-detail-empty">尚无该位置的选址情景结果。</p>'
              }</section>`
            : ''
        }
      </div>`;
    this.#root.querySelector('[data-close-detail]')?.addEventListener('click', () => this.#close());
    this.#root.querySelector('[data-locate-detail]')?.addEventListener('click', () => {
      window.GeomapLegacyBridge?.focusLocation(location.name);
    });
    this.#root.querySelector('[data-add-detail-record]')?.addEventListener('click', () => {
      window.dispatchEvent(
        new CustomEvent('geomap:navigate-section', { detail: { section: 'history' } })
      );
      this.#close();
      window.dispatchEvent(
        new CustomEvent('geomap:add-record', { detail: { locationId: location.locationId } })
      );
    });
    this.#root.querySelectorAll<HTMLButtonElement>('[data-detail-section]').forEach((button) => {
      button.addEventListener('click', () => {
        window.dispatchEvent(
          new CustomEvent('geomap:navigate-section', {
            detail: { section: button.dataset.detailSection }
          })
        );
        this.#close();
      });
    });
  }
}
