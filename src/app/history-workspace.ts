import {
  aggregateMetricsAtTime,
  compareHistorySnapshots,
  historyBounds,
  reconstructHistorySnapshot,
  resolveRecordRevisions
} from '../domain/history';
import type { GeomapFeatureStore } from '../store/feature-store';
import type { GeomapRecordStore } from '../store/record-store';
import type {
  BusinessRecord,
  BusinessRecordType,
  HistoryComparison,
  HistoryGranularity,
  HistorySnapshot,
  JsonValue
} from '../types';

const RECORD_LABELS: Record<BusinessRecordType, string> = {
  event: '事件',
  metric: '经营数据',
  'state-change': '状态变更',
  plan: '计划/目标',
  decision: '决策'
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function dayValue(value: string): number {
  return Math.floor(new Date(value).getTime() / 86_400_000);
}

function fromDayValue(value: number): string {
  return new Date(value * 86_400_000 + 43_200_000).toISOString();
}

function dateInput(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateTimeInput(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function addStep(value: string, granularity: HistoryGranularity): string {
  const date = new Date(value);
  if (granularity === 'day') date.setUTCDate(date.getUTCDate() + 1);
  if (granularity === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  if (granularity === 'quarter') date.setUTCMonth(date.getUTCMonth() + 3);
  if (granularity === 'year') date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

export class HistoryWorkspace {
  readonly #workspace: GeomapFeatureStore;
  readonly #records: GeomapRecordStore;
  #root: HTMLElement | null = null;
  #dialog: HTMLDialogElement | null = null;
  #active = false;
  #at = new Date().toISOString();
  #baseline = new Date(Date.now() - 365 * 86_400_000).toISOString();
  #granularity: HistoryGranularity = 'month';
  #speed: 0.5 | 1 | 2 | 4 = 1;
  #timer: number | null = null;
  #comparison: HistoryComparison | null = null;
  #snapshot: HistorySnapshot | null = null;
  #editingRecordId: string | null = null;
  #series = 'all';
  #selectedChangeId: string | null = null;

  constructor(workspace: GeomapFeatureStore, records: GeomapRecordStore) {
    this.#workspace = workspace;
    this.#records = records;
  }

  mount(): void {
    if (document.getElementById('historyWorkspace')) return;
    this.#root = document.createElement('section');
    this.#root.id = 'historyWorkspace';
    this.#root.className = 'history-workspace';
    this.#root.setAttribute('aria-label', '经营时间轴');
    document.body.append(this.#root);

    this.#dialog = document.createElement('dialog');
    this.#dialog.id = 'historyRecordDialog';
    this.#dialog.className = 'history-record-dialog';
    this.#dialog.setAttribute('aria-labelledby', 'historyRecordTitle');
    document.body.append(this.#dialog);

    window.addEventListener('geomap:section-changed', (event) => {
      const section = (event as CustomEvent<{ section?: string }>).detail?.section;
      this.#active = section === 'history';
      document.body.classList.toggle('history-mode', this.#active);
      if (this.#active) this.#updateSnapshot();
      else {
        window.GeomapLegacyBridge?.applyHistoricalState(null);
        window.dispatchEvent(
          new CustomEvent('geomap:history-state-changed', { detail: { locations: null } })
        );
      }
      this.#render();
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    });
    window.addEventListener('geomap:add-record', (event) => {
      if (!this.#active) return;
      const locationId = (event as CustomEvent<{ locationId?: string }>).detail?.locationId;
      this.#openRecordDialog(undefined, locationId);
    });
    this.#workspace.subscribe(() => {
      if (!this.#active) return;
      this.#updateSnapshot();
      this.#render();
    });
    this.#render();
  }

  #updateSnapshot(): void {
    const state = this.#workspace.getState();
    this.#snapshot = reconstructHistorySnapshot(state.locations, state.records, this.#at);
    const locationIds = this.#snapshot.locations.map((location) => location.locationId);
    const statusById = Object.fromEntries(
      this.#snapshot.locations.map((location) => [location.locationId, location.status])
    );
    window.GeomapLegacyBridge?.applyHistoricalState({ locationIds, statusById });
    window.dispatchEvent(
      new CustomEvent('geomap:history-state-changed', {
        detail: {
          at: this.#at,
          locations: this.#snapshot.locations,
          records: this.#snapshot.records
        }
      })
    );
  }

  #render(): void {
    if (!this.#root) return;
    this.#root.hidden = !this.#active;
    if (!this.#active) return;
    const state = this.#workspace.getState();
    const bounds = historyBounds(state.locations, state.records);
    const min = dayValue(bounds.min);
    const max = dayValue(bounds.max);
    const current = Math.min(max, Math.max(min, dayValue(this.#at)));
    const records = resolveRecordRevisions(state.records).sort(
      (left, right) => new Date(right.validFrom).getTime() - new Date(left.validFrom).getTime()
    );
    const visibleRecords = records.filter((record) => this.#matchesSeries(record));
    const metricSummaries = aggregateMetricsAtTime(records, this.#at).slice(0, 2);
    const storyViews = state.savedViews.filter(
      (view): view is Record<string, JsonValue> =>
        view !== null && typeof view === 'object' && !Array.isArray(view) && view.kind === 'history'
    );
    const selectedChange = this.#comparison?.changes.find(
      (change) => change.locationId === this.#selectedChangeId
    );
    const evidenceRecords = selectedChange
      ? this.#records
          .list()
          .filter((record) => selectedChange.recordIds.includes(record.recordId))
          .slice(-3)
      : [];
    const marks = visibleRecords
      .filter((record) => dayValue(record.validFrom) >= min && dayValue(record.validFrom) <= max)
      .map((record) => {
        const left = max === min ? 0 : ((dayValue(record.validFrom) - min) / (max - min)) * 100;
        return `<button type="button" class="history-mark" style="left:${left}%" data-record="${escapeHtml(record.recordId)}" title="${escapeHtml(record.title)}"></button>`;
      })
      .join('');

    this.#root.innerHTML = `
      <div class="history-toolbar">
        <button id="historyPlay" type="button" aria-label="${this.#timer ? '暂停播放' : '播放时间'}"><i class="fa-solid ${this.#timer ? 'fa-pause' : 'fa-play'}"></i></button>
        <label>日期<input id="historyAt" type="date" value="${dateInput(this.#at)}" min="${dateInput(bounds.min)}" max="${dateInput(bounds.max)}" /></label>
        <label>粒度<select id="historyGranularity"><option value="day"${this.#granularity === 'day' ? ' selected' : ''}>日</option><option value="month"${this.#granularity === 'month' ? ' selected' : ''}>月</option><option value="quarter"${this.#granularity === 'quarter' ? ' selected' : ''}>季</option><option value="year"${this.#granularity === 'year' ? ' selected' : ''}>年</option></select></label>
        <label>速度<select id="historySpeed"><option value="0.5"${this.#speed === 0.5 ? ' selected' : ''}>0.5×</option><option value="1"${this.#speed === 1 ? ' selected' : ''}>1×</option><option value="2"${this.#speed === 2 ? ' selected' : ''}>2×</option><option value="4"${this.#speed === 4 ? ' selected' : ''}>4×</option></select></label>
        <label>专题<select id="historySeries"><option value="all"${this.#series === 'all' ? ' selected' : ''}>全部记录</option><option value="store"${this.#series === 'store' ? ' selected' : ''}>门店线</option><option value="region"${this.#series === 'region' ? ' selected' : ''}>区域线</option><option value="project"${this.#series === 'project' ? ' selected' : ''}>项目线</option><option value="strategy"${this.#series === 'strategy' ? ' selected' : ''}>策略线</option></select></label>
        <div class="history-range-wrap"><span>${dateInput(bounds.min)}</span><div class="history-range-track">${marks}<input id="historyRange" type="range" min="${min}" max="${max}" value="${current}" aria-label="历史时间" /></div><span>${dateInput(bounds.max)}</span></div>
        <button id="historyAddRecord" class="history-primary" type="button"><i class="fa-solid fa-plus"></i>新增记录</button>
        <button id="historyBatchMetric" type="button"><i class="fa-solid fa-table-cells"></i>录入指标</button>
        <button id="historyCompareToggle" type="button"><i class="fa-solid fa-code-compare"></i>时间对比</button>
        <button id="historySaveView" type="button"><i class="fa-solid fa-bookmark"></i>保存复盘</button>
        ${storyViews.length ? `<label>复盘<select id="historySavedView"><option value="">选择视图</option>${storyViews.map((view) => `<option value="${escapeHtml(String(view.viewId))}">${escapeHtml(String(view.name))}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="history-context-line"><strong>${new Date(this.#at).toLocaleDateString('zh-CN')}</strong><span>${this.#snapshot?.locations.length ?? 0} 个历史对象</span><span>${this.#snapshot?.records.length ?? 0} 条截至此时的记录</span>${metricSummaries.map((metric) => `<span class="history-metric-summary"><em>${escapeHtml(metric.metricKey)}</em><strong>${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(metric.value)}${escapeHtml(metric.unit ?? '')}</strong><small>${escapeHtml(metric.period)} · ${metric.observations} 店</small></span>`).join('')}<span>业务时间与录入时间分开保存</span></div>
      <div class="history-detail-row">
        <div class="history-record-strip" aria-label="最近经营记录">${
          visibleRecords
            .slice(0, 5)
            .map(
              (record) =>
                `<button type="button" data-record="${escapeHtml(record.recordId)}"><em data-type="${record.recordType}">${RECORD_LABELS[record.recordType]}</em><span><strong>${escapeHtml(record.title)}</strong><small>发生 ${new Date(record.validFrom).toLocaleDateString('zh-CN')} · 录入 ${new Date(record.recordedAt).toLocaleDateString('zh-CN')} · ${record.confidence === 'confirmed' ? '已确认' : record.confidence === 'estimated' ? '估算' : '预测'}</small></span></button>`
            )
            .join('') || '<p>暂无记录，点击“记录”开始建立经营历史。</p>'
        }</div>
        <div class="history-compare-box">
          <label>A<input id="historyBaseline" type="date" value="${dateInput(this.#baseline)}" /></label>
          <label>B<input id="historyCompareAt" type="date" value="${dateInput(this.#at)}" /></label>
          <button id="historyCompare" type="button">比较</button>
          ${
            this.#comparison
              ? `<div class="history-diff-summary"><span>新增 <strong>${this.#comparison.added}</strong></span><span>移除 <strong>${this.#comparison.removed}</strong></span><span>变化 <strong>${this.#comparison.changed}</strong></span></div><div class="history-diff-list">${this.#comparison.changes
                  .slice(0, 4)
                  .map(
                    (change) =>
                      `<button type="button" data-location-id="${escapeHtml(change.locationId)}"><strong>${escapeHtml(change.name)}</strong><span>${change.kind === 'added' ? '新增' : change.kind === 'removed' ? '移除' : change.changes.map((item) => item.field).join('、')}</span></button>`
                  )
                  .join(
                    ''
                  )}</div>${selectedChange ? `<div class="history-diff-evidence"><strong>${escapeHtml(selectedChange.name)} · 变化依据</strong>${evidenceRecords.map((record) => `<button type="button" data-record="${escapeHtml(record.recordId)}"><span>${escapeHtml(record.title)}</span><small>发生 ${new Date(record.validFrom).toLocaleString('zh-CN', { hour12: false })} · 录入 ${new Date(record.recordedAt).toLocaleString('zh-CN', { hour12: false })}</small></button>`).join('') || '<small>该变化来自对象生命周期字段，可在门店详情查看原始对象。</small>'}</div>` : ''}`
              : '<p>选择两个日期，查看网络扩张和状态变化。</p>'
          }
        </div>
      </div>`;
    this.#bindEvents();
  }

  #bindEvents(): void {
    this.#root?.querySelector('#historyPlay')?.addEventListener('click', () => this.#togglePlay());
    this.#root
      ?.querySelector<HTMLInputElement>('#historyAt')
      ?.addEventListener('change', (event) => {
        this.#setAt((event.currentTarget as HTMLInputElement).value);
      });
    this.#root
      ?.querySelector<HTMLInputElement>('#historyRange')
      ?.addEventListener('input', (event) => {
        this.#at = fromDayValue(Number((event.currentTarget as HTMLInputElement).value));
        this.#updateSnapshot();
        this.#render();
      });
    this.#root
      ?.querySelector<HTMLSelectElement>('#historyGranularity')
      ?.addEventListener('change', (event) => {
        this.#granularity = (event.currentTarget as HTMLSelectElement).value as HistoryGranularity;
        this.#render();
      });
    this.#root
      ?.querySelector<HTMLSelectElement>('#historySpeed')
      ?.addEventListener('change', (event) => {
        this.#speed = Number((event.currentTarget as HTMLSelectElement).value) as 0.5 | 1 | 2 | 4;
        if (this.#timer) {
          this.#stopPlay();
          this.#startPlay();
        }
        this.#render();
      });
    this.#root
      ?.querySelector<HTMLSelectElement>('#historySeries')
      ?.addEventListener('change', (event) => {
        this.#series = (event.currentTarget as HTMLSelectElement).value;
        this.#render();
      });
    this.#root?.querySelector('#historyAddRecord')?.addEventListener('click', () => {
      this.#openRecordDialog();
    });
    this.#root?.querySelector('#historyBatchMetric')?.addEventListener('click', () => {
      this.#openBatchMetricDialog();
    });
    this.#root?.querySelector('#historyCompareToggle')?.addEventListener('click', () => {
      this.#root?.querySelector('.history-compare-box')?.scrollIntoView({ behavior: 'smooth' });
      this.#root?.querySelector<HTMLInputElement>('#historyBaseline')?.focus();
    });
    this.#root?.querySelector('#historySaveView')?.addEventListener('click', () => {
      this.#saveStoryView();
    });
    this.#root
      ?.querySelector<HTMLSelectElement>('#historySavedView')
      ?.addEventListener('change', (event) => {
        this.#loadStoryView((event.currentTarget as HTMLSelectElement).value);
      });
    this.#root?.querySelector('#historyCompare')?.addEventListener('click', () => {
      const baseline = this.#root?.querySelector<HTMLInputElement>('#historyBaseline')?.value;
      const target = this.#root?.querySelector<HTMLInputElement>('#historyCompareAt')?.value;
      if (!baseline || !target) return;
      this.#baseline = new Date(`${baseline}T12:00:00`).toISOString();
      this.#at = new Date(`${target}T12:00:00`).toISOString();
      this.#selectedChangeId = null;
      const state = this.#workspace.getState();
      this.#comparison = compareHistorySnapshots(
        reconstructHistorySnapshot(state.locations, state.records, this.#baseline),
        reconstructHistorySnapshot(state.locations, state.records, this.#at)
      );
      this.#updateSnapshot();
      this.#render();
    });
    this.#root?.querySelectorAll<HTMLButtonElement>('[data-record]').forEach((button) => {
      button.addEventListener('click', () => {
        const record = this.#records.list().find((item) => item.recordId === button.dataset.record);
        if (record) this.#openRecordDialog(record);
      });
    });
    this.#root?.querySelectorAll<HTMLButtonElement>('[data-location-id]').forEach((button) => {
      button.addEventListener('click', () => {
        this.#selectedChangeId = button.dataset.locationId ?? null;
        const state = this.#workspace.getState();
        const location = state.locations.find(
          (item) => item.locationId === button.dataset.locationId
        );
        if (location) window.GeomapLegacyBridge?.focusLocation(location.name);
        this.#render();
      });
    });
  }

  #setAt(value: string): void {
    if (!value) return;
    this.#at = new Date(`${value}T12:00:00`).toISOString();
    this.#comparison = null;
    this.#selectedChangeId = null;
    this.#updateSnapshot();
    this.#render();
  }

  #matchesSeries(record: BusinessRecord): boolean {
    if (this.#series === 'all') return true;
    if (this.#series === 'store') return record.entityRefs.length > 0;
    if (this.#series === 'region') {
      return Boolean(record.areaRef) || record.tags.some((tag) => tag.includes('区域'));
    }
    if (this.#series === 'project') return record.tags.some((tag) => tag.includes('项目'));
    if (this.#series === 'strategy') return record.tags.some((tag) => tag.includes('策略'));
    return true;
  }

  #saveStoryView(): void {
    const state = this.#workspace.getState();
    const name = `经营复盘 ${dateInput(this.#at)}`;
    const view: JsonValue = {
      viewId: `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'history',
      name,
      createdAt: new Date().toISOString(),
      at: this.#at,
      baseline: this.#baseline,
      granularity: this.#granularity,
      series: this.#series,
      compared: Boolean(this.#comparison)
    };
    this.#workspace.setSavedViews([...state.savedViews, view]);
  }

  #loadStoryView(viewId: string): void {
    if (!viewId) return;
    const view = this.#workspace
      .getState()
      .savedViews.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          item.kind === 'history' &&
          item.viewId === viewId
      );
    if (!view || typeof view !== 'object' || Array.isArray(view)) return;
    if (typeof view.at === 'string') this.#at = view.at;
    if (typeof view.baseline === 'string') this.#baseline = view.baseline;
    if (
      view.granularity === 'day' ||
      view.granularity === 'month' ||
      view.granularity === 'quarter' ||
      view.granularity === 'year'
    ) {
      this.#granularity = view.granularity;
    }
    if (typeof view.series === 'string') this.#series = view.series;
    const state = this.#workspace.getState();
    this.#comparison = view.compared
      ? compareHistorySnapshots(
          reconstructHistorySnapshot(state.locations, state.records, this.#baseline),
          reconstructHistorySnapshot(state.locations, state.records, this.#at)
        )
      : null;
    this.#updateSnapshot();
    this.#render();
  }

  #togglePlay(): void {
    if (this.#timer) this.#stopPlay();
    else this.#startPlay();
    this.#render();
  }

  #startPlay(): void {
    const state = this.#workspace.getState();
    const max = new Date(historyBounds(state.locations, state.records).max).getTime();
    this.#timer = window.setInterval(() => {
      const next = addStep(this.#at, this.#granularity);
      if (new Date(next).getTime() > max) {
        this.#stopPlay();
        this.#render();
        return;
      }
      this.#at = next;
      this.#updateSnapshot();
      this.#render();
    }, 1200 / this.#speed);
  }

  #stopPlay(): void {
    if (this.#timer) window.clearInterval(this.#timer);
    this.#timer = null;
  }

  #openRecordDialog(record?: BusinessRecord, selectedLocationId?: string): void {
    if (!this.#dialog) return;
    this.#editingRecordId = record?.recordId ?? null;
    const locations = this.#workspace.getState().locations;
    const selected = record?.entityRefs[0] ?? selectedLocationId ?? locations[0]?.locationId ?? '';
    this.#dialog.innerHTML = `
      <form method="dialog" id="historyRecordForm">
        <div class="history-dialog-header"><div><span>${record ? '更正记录' : '新增经营记录'}</span><h2 id="historyRecordTitle">${record ? escapeHtml(record.title) : '记录发生了什么'}</h2></div><button value="cancel" type="button" data-close aria-label="关闭">×</button></div>
        ${record ? '<p class="history-revision-note">保存后将创建一条更正记录，原记录和引用不会被覆盖。</p>' : ''}
        <div class="history-form-grid">
          <label>记录类型<select name="recordType">${Object.entries(RECORD_LABELS)
            .map(
              ([value, label]) =>
                `<option value="${value}"${record?.recordType === value ? ' selected' : ''}>${label}</option>`
            )
            .join('')}</select></label>
          <label>关联位置<select name="entityRef" required>${locations.map((location) => `<option value="${escapeHtml(location.locationId)}"${location.locationId === selected ? ' selected' : ''}>${escapeHtml(location.name)} · ${escapeHtml(location.region ?? '未分区')}</option>`).join('')}</select></label>
          <label class="history-form-wide">标题<input name="title" required maxlength="100" value="${escapeHtml(record?.title ?? '')}" placeholder="例如：奥帆店完成试营业" /></label>
          <label>发生/生效时间<input name="validFrom" type="datetime-local" required value="${dateTimeInput(record?.validFrom ?? this.#at)}" /></label>
          <label>结束时间（可选）<input name="validTo" type="datetime-local" value="${record?.validTo ? dateTimeInput(record.validTo) : ''}" /></label>
          <label>可信度<select name="confidence"><option value="confirmed"${record?.confidence === 'confirmed' ? ' selected' : ''}>已确认</option><option value="estimated"${record?.confidence === 'estimated' ? ' selected' : ''}>估算</option><option value="forecast"${record?.confidence === 'forecast' ? ' selected' : ''}>预测</option></select></label>
          <label data-state-field>变更后状态<select name="nextStatus">${[
            ['planned', '计划'],
            ['preparing', '筹备'],
            ['open', '在营'],
            ['paused', '停业'],
            ['closed', '闭店']
          ]
            .map(
              ([value, label]) =>
                `<option value="${value}"${record?.payload.status === value ? ' selected' : ''}>${label}</option>`
            )
            .join('')}</select></label>
          <label data-metric-field>指标键<input name="metricKey" value="${escapeHtml(typeof record?.payload.metricKey === 'string' ? record.payload.metricKey : '')}" placeholder="revenue / orders" /></label>
          <label data-metric-field>数值<input name="metricValue" type="number" step="any" value="${typeof record?.payload.value === 'number' ? record.payload.value : ''}" /></label>
          <label data-metric-field>单位<input name="metricUnit" value="${escapeHtml(typeof record?.payload.unit === 'string' ? record.payload.unit : '')}" placeholder="元、单、人" /></label>
          <label class="history-form-wide">说明/依据<textarea name="notes" rows="4" placeholder="记录影响、原因、责任人或数据口径">${escapeHtml(typeof record?.payload.notes === 'string' ? record.payload.notes : '')}</textarea></label>
        </div>
        <p class="history-form-error" role="alert"></p>
        <div class="history-dialog-actions"><button value="cancel" type="button" data-close>取消</button><button class="history-primary" type="submit">${record ? '保存更正' : '保存记录'}</button></div>
      </form>`;
    const form = this.#dialog.querySelector<HTMLFormElement>('#historyRecordForm');
    const typeSelect = form?.elements.namedItem('recordType') as HTMLSelectElement | null;
    const toggleFields = (): void => {
      const type = typeSelect?.value;
      this.#dialog?.querySelectorAll<HTMLElement>('[data-state-field]').forEach((item) => {
        item.hidden = type !== 'state-change';
      });
      this.#dialog?.querySelectorAll<HTMLElement>('[data-metric-field]').forEach((item) => {
        item.hidden = type !== 'metric';
      });
    };
    typeSelect?.addEventListener('change', toggleFields);
    toggleFields();
    this.#dialog.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => this.#dialog?.close());
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submitRecord(form);
    });
    this.#dialog.showModal();
  }

  #openBatchMetricDialog(): void {
    if (!this.#dialog) return;
    this.#editingRecordId = null;
    const locations = this.#workspace.getState().locations;
    const month = dateInput(this.#at).slice(0, 7);
    this.#dialog.innerHTML = `
      <form method="dialog" id="historyBatchMetricForm">
        <div class="history-dialog-header"><div><span>月度批量录入</span><h2 id="historyRecordTitle">复制上期，再修正本期数值</h2></div><button value="cancel" type="button" data-close aria-label="关闭">×</button></div>
        <div class="history-form-grid">
          <label>月份<input name="period" type="month" required value="${month}" /></label>
          <label>指标键<input name="metricKey" required value="revenue" placeholder="revenue / orders" /></label>
          <label>单位<input name="unit" value="元" /></label>
          <label>可信度<select name="confidence"><option value="confirmed">已确认</option><option value="estimated">估算</option><option value="forecast">预测</option></select></label>
          <label class="history-form-wide">门店编号与数值<textarea name="rows" rows="9" required placeholder="QD-001,125000\nQD-002,118000"></textarea></label>
        </div>
        <p class="history-batch-hint">支持逗号或 Tab 分隔。可用位置：${locations
          .slice(0, 8)
          .map((location) => `${escapeHtml(location.locationId)} ${escapeHtml(location.name)}`)
          .join('；')}</p>
        <p class="history-form-error" role="alert"></p>
        <div class="history-dialog-actions"><button type="button" id="historyCopyPrevious">复制上期</button><button value="cancel" type="button" data-close>取消</button><button class="history-primary" type="submit">提交本期</button></div>
      </form>`;
    const form = this.#dialog.querySelector<HTMLFormElement>('#historyBatchMetricForm');
    this.#dialog.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => this.#dialog?.close());
    });
    this.#dialog.querySelector('#historyCopyPrevious')?.addEventListener('click', () => {
      if (form) this.#copyPreviousMetrics(form);
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submitBatchMetrics(form);
    });
    this.#dialog.showModal();
  }

  #copyPreviousMetrics(form: HTMLFormElement): void {
    const periodInput = form.elements.namedItem('period') as HTMLInputElement;
    const metricInput = form.elements.namedItem('metricKey') as HTMLInputElement;
    const rowsInput = form.elements.namedItem('rows') as HTMLTextAreaElement;
    const [year, month] = periodInput.value.split('-').map(Number);
    if (!year || !month || !metricInput.value.trim()) {
      this.#showFormError('请先填写月份和指标键');
      return;
    }
    const previous = new Date(Date.UTC(year, month - 2, 1));
    const previousKey = previous.toISOString().slice(0, 7);
    const metricKey = metricInput.value.trim();
    const rows = resolveRecordRevisions(this.#records.list())
      .filter(
        (record) =>
          record.recordType === 'metric' &&
          record.validFrom.slice(0, 7) === previousKey &&
          record.payload.metricKey === metricKey &&
          typeof record.payload.value === 'number'
      )
      .map((record) => `${record.entityRefs[0]},${String(record.payload.value)}`);
    if (!rows.length) {
      this.#showFormError(`${previousKey} 没有可复制的 ${metricKey} 数据`);
      return;
    }
    rowsInput.value = rows.join('\n');
    this.#showFormError(`已复制 ${rows.length} 行，请修正后提交`);
  }

  #submitBatchMetrics(form: HTMLFormElement): void {
    const data = new FormData(form);
    const period = String(data.get('period') ?? '');
    const metricKey = String(data.get('metricKey') ?? '').trim();
    const unit = String(data.get('unit') ?? '').trim();
    const confidence = String(data.get('confidence')) as 'confirmed' | 'estimated' | 'forecast';
    try {
      const knownLocations = new Set(
        this.#workspace.getState().locations.map((location) => location.locationId)
      );
      const parsedRows = String(data.get('rows') ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const [locationId = '', rawValue = ''] = line.split(/[\t,，]/).map((item) => item.trim());
          const value = Number(rawValue);
          if (!knownLocations.has(locationId)) {
            throw new Error(`第 ${index + 1} 行位置编号不存在：${locationId}`);
          }
          if (!Number.isFinite(value)) throw new Error(`第 ${index + 1} 行数值无效`);
          return { locationId, value };
        });
      if (!/^\d{4}-\d{2}$/.test(period) || !metricKey || !parsedRows.length) {
        throw new Error('请填写月份、指标键和至少一行有效数据');
      }
      const periodStart = new Date(`${period}-01T00:00:00Z`).toISOString();
      const periodEndDate = new Date(periodStart);
      periodEndDate.setMonth(periodEndDate.getMonth() + 1);
      periodEndDate.setMilliseconds(-1);
      this.#records.addMany(
        parsedRows.map(({ locationId, value }) => ({
          recordType: 'metric',
          title: `${metricKey} ${period}`,
          validFrom: periodStart,
          validTo: periodEndDate.toISOString(),
          entityRefs: [locationId],
          confidence,
          sourceId: 'manual-batch',
          payload: {
            metricKey,
            value,
            unit,
            periodStart,
            periodEnd: periodEndDate.toISOString()
          },
          tags: ['月度指标', metricKey]
        }))
      );
      this.#dialog?.close();
    } catch (error) {
      this.#showFormError(error instanceof Error ? error.message : '批量指标提交失败');
    }
  }

  #submitRecord(form: HTMLFormElement): void {
    const data = new FormData(form);
    const type = String(data.get('recordType')) as BusinessRecordType;
    const payload: Record<string, JsonValue> = { notes: String(data.get('notes') ?? '') };
    if (type === 'state-change') payload.status = String(data.get('nextStatus') ?? 'open');
    if (type === 'metric') {
      payload.metricKey = String(data.get('metricKey') ?? '').trim();
      const metricValue = Number(data.get('metricValue'));
      if (!payload.metricKey || !Number.isFinite(metricValue)) {
        this.#showFormError('经营数据必须填写指标键和有效数值');
        return;
      }
      payload.value = metricValue;
      payload.unit = String(data.get('metricUnit') ?? '').trim();
    }
    try {
      const draft = {
        recordType: type,
        title: String(data.get('title') ?? ''),
        validFrom: String(data.get('validFrom') ?? ''),
        validTo: String(data.get('validTo') ?? '') || undefined,
        entityRefs: [String(data.get('entityRef') ?? '')],
        confidence: String(data.get('confidence')) as 'confirmed' | 'estimated' | 'forecast',
        payload
      };
      if (this.#editingRecordId) this.#records.revise(this.#editingRecordId, draft);
      else this.#records.add(draft);
      this.#dialog?.close();
      this.#editingRecordId = null;
    } catch (error) {
      this.#showFormError(error instanceof Error ? error.message : '保存记录失败');
    }
  }

  #showFormError(message: string): void {
    const target = this.#dialog?.querySelector<HTMLElement>('.history-form-error');
    if (target) target.textContent = message;
  }
}
