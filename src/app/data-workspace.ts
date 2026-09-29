import {
  buildMetricDashboard,
  parseCsvTable,
  previewMetricImport,
  type TabularRow
} from '../domain/business-data';
import type { GeomapFeatureStore } from '../store/feature-store';
import type { GeomapMetricStore } from '../store/metric-store';
import type { MetricDefinition, MetricImportMapping, MetricImportPreview } from '../types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value: number, definition: MetricDefinition): string {
  if (definition.format === 'currency') {
    return new Intl.NumberFormat('zh-CN', {
      notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
      maximumFractionDigits: 1
    }).format(value);
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);
}

function automaticColumn(columns: string[], aliases: string[], fallback = true): string {
  const normalized = aliases.map((alias) => alias.toLowerCase());
  return (
    columns.find((column) => normalized.includes(column.trim().toLowerCase())) ??
    (fallback ? (columns[0] ?? '') : '')
  );
}

export class DataWorkspace {
  readonly #workspace: GeomapFeatureStore;
  readonly #metrics: GeomapMetricStore;
  #root: HTMLElement | null = null;
  #dialog: HTMLDialogElement | null = null;
  #active = false;
  #metricKey = 'revenue';
  #period = '';
  #query = '';
  #region = 'all';
  #status = 'all';
  #mapView = false;
  #rows: TabularRow[] = [];
  #columns: string[] = [];
  #sourceName = '';
  #mapping: MetricImportMapping | null = null;
  #preview: MetricImportPreview | null = null;
  #message = '';

  constructor(workspace: GeomapFeatureStore, metrics: GeomapMetricStore) {
    this.#workspace = workspace;
    this.#metrics = metrics;
  }

  mount(): void {
    if (document.getElementById('dataWorkspace')) return;
    this.#root = document.createElement('section');
    this.#root.id = 'dataWorkspace';
    this.#root.className = 'data-workspace';
    this.#root.setAttribute('aria-label', '经营数据中心');
    document.body.append(this.#root);
    this.#dialog = document.createElement('dialog');
    this.#dialog.id = 'metricImportDialog';
    this.#dialog.className = 'metric-import-dialog';
    document.body.append(this.#dialog);
    window.addEventListener('geomap:section-changed', (event) => {
      this.#active = (event as CustomEvent<{ section?: string }>).detail?.section === 'data';
      document.body.classList.toggle('business-data-mode', this.#active);
      if (!this.#active) window.GeomapLegacyBridge?.applyMetricState(null);
      this.#render();
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    });
    window.addEventListener('geomap:location-filter-changed', (event) => {
      const detail = (event as CustomEvent<{ query?: string; region?: string; status?: string }>)
        .detail;
      this.#query = detail.query ?? '';
      this.#region = detail.region ?? 'all';
      this.#status = detail.status ?? 'all';
      if (this.#active) this.#render();
    });
    this.#workspace.subscribe(() => {
      if (this.#active) this.#render();
    });
    this.#render();
  }

  #render(): void {
    if (!this.#root) return;
    this.#root.hidden = !this.#active;
    if (!this.#active) return;
    this.#root.classList.toggle('is-map-view', this.#mapView);
    const state = this.#workspace.getState();
    const query = this.#query.trim().toLowerCase();
    const filteredLocations = state.locations.filter(
      (location) =>
        (!query ||
          `${location.name} ${location.region ?? ''} ${location.address ?? ''}`
            .toLowerCase()
            .includes(query)) &&
        (this.#region === 'all' || location.region === this.#region) &&
        (this.#status === 'all' || location.status === this.#status)
    );
    const allowedIds = new Set(filteredLocations.map((location) => location.locationId));
    const filteredRecords = state.records.filter(
      (record) =>
        record.recordType !== 'metric' || record.entityRefs.some((id) => allowedIds.has(id))
    );
    const definitions = this.#metrics.definitions();
    const definition =
      definitions.find((item) => item.metricKey === this.#metricKey) ?? definitions[0];
    if (!definition) return;
    this.#metricKey = definition.metricKey;
    const dashboard = buildMetricDashboard(
      filteredRecords,
      filteredLocations,
      definition,
      this.#period || undefined
    );
    this.#period = dashboard.period;
    const maximumRegion = Math.max(1, ...dashboard.byRegion.map((item) => item.value));
    const maximumTrend = Math.max(1, ...dashboard.trend.map((item) => item.value));
    const locationById = new Map(
      filteredLocations.map((location) => [location.locationId, location])
    );
    const regions = [
      ...new Set(state.locations.map((location) => location.region).filter(Boolean))
    ].sort();
    const maximumLocation = Math.max(1, ...dashboard.byLocation.map((item) => item.value));
    window.GeomapLegacyBridge?.applyMetricState({
      values: Object.fromEntries(
        dashboard.byLocation.map((item) => [
          item.locationId,
          Math.max(0, Math.min(1, item.value / maximumLocation))
        ])
      ),
      metricKey: definition.metricKey
    });

    this.#root.innerHTML = `
      <header class="data-header"><div><span>统一经营口径</span><h1>经营数据中心</h1><p>导入前校验 · 复合主键去重 · 来源可追溯 · 地图与指标同一筛选</p></div><div><button id="dataMapToggle" type="button"><i class="fa-solid fa-map"></i> ${this.#mapView ? '数据看板' : '地图视图'}</button><button id="dataAddMetric" type="button">指标字典</button><button id="dataImport" class="is-primary" type="button"><i class="fa-solid fa-file-import"></i> 导入 CSV / Excel</button></div></header>
      ${this.#message ? `<div class="data-message" role="status">${escapeHtml(this.#message)}</div>` : ''}
      <div class="data-toolbar">
        <label>指标<select id="dataMetric">${definitions.map((item) => `<option value="${escapeHtml(item.metricKey)}"${item.metricKey === definition.metricKey ? ' selected' : ''}>${escapeHtml(item.name)}（${escapeHtml(item.unit)}）</option>`).join('')}</select></label>
        <label>周期<input id="dataPeriod" type="month" value="${escapeHtml(dashboard.period)}" /></label>
        <label>区域<select id="dataRegion"><option value="all">全部区域</option>${regions.map((region) => `<option value="${escapeHtml(region!)}"${region === this.#region ? ' selected' : ''}>${escapeHtml(region!)}</option>`).join('')}</select></label>
        <span>口径：${escapeHtml(definition.description)}</span><span>聚合：${definition.aggregation}</span><span>来源版本：${state.dataSources.length}</span>
      </div>
      <div class="data-kpis">
        <article><span>${escapeHtml(definition.name)}合计</span><strong>${formatNumber(dashboard.total, definition)}</strong><small>${escapeHtml(definition.unit)} · ${dashboard.period || '暂无周期'}</small></article>
        <article><span>门店平均</span><strong>${formatNumber(dashboard.average, definition)}</strong><small>${dashboard.observations} 个有效观测</small></article>
        <article><span>目标达成</span><strong>${dashboard.targetAttainment === null ? '—' : `${dashboard.targetAttainment}%`}</strong><small>仅汇总有目标的记录</small></article>
        <article><span>环比</span><strong class="${(dashboard.previousChange ?? 0) < 0 ? 'is-negative' : ''}">${dashboard.previousChange === null ? '—' : `${dashboard.previousChange > 0 ? '+' : ''}${dashboard.previousChange}%`}</strong><small>与上一有效周期比较</small></article>
        <article><span>同比</span><strong class="${(dashboard.yearChange ?? 0) < 0 ? 'is-negative' : ''}">${dashboard.yearChange === null ? '—' : `${dashboard.yearChange > 0 ? '+' : ''}${dashboard.yearChange}%`}</strong><small>与去年同期比较</small></article>
      </div>
      <div class="data-grid">
        <section class="data-panel data-trend"><header><div><span>趋势</span><h2>最近 12 个周期</h2></div><small>与地图使用相同指标</small></header><div class="data-bars">${dashboard.trend.map((item) => `<div><span>${escapeHtml(item.period)}</span><i style="--height:${Math.max(3, (item.value / maximumTrend) * 100)}%"></i><strong>${formatNumber(item.value, definition)}</strong></div>`).join('') || '<p>导入经营数据后显示趋势。</p>'}</div></section>
        <section class="data-panel data-regions"><header><div><span>区域</span><h2>区域排行</h2></div><small>${dashboard.byRegion.length} 个区域</small></header>${dashboard.byRegion.map((item, index) => `<button type="button" data-data-region="${escapeHtml(item.region)}"><em>#${index + 1}</em><span><strong>${escapeHtml(item.region)}</strong><i style="--width:${(item.value / maximumRegion) * 100}%"></i></span><b>${formatNumber(item.value, definition)}</b></button>`).join('') || '<p>暂无区域数据。</p>'}</section>
        <section class="data-panel data-locations"><header><div><span>明细</span><h2>门店表现与来源</h2></div><small>${dashboard.byLocation.length} 条</small></header><div class="data-location-table">${
          dashboard.byLocation
            .sort((left, right) => right.value - left.value)
            .map((item) => {
              const location = locationById.get(item.locationId);
              return `<button type="button" data-data-location="${escapeHtml(item.locationId)}"><span><strong>${escapeHtml(location?.name ?? item.locationId)}</strong><small>${escapeHtml(location?.region ?? '未分区')} · ${dashboard.period}</small></span><b>${formatNumber(item.value, definition)} ${escapeHtml(definition.unit)}</b><em>${item.target ? `目标 ${formatNumber(item.target, definition)}` : '未设目标'}</em></button>`;
            })
            .join('') || '<p>暂无门店观测。</p>'
        }</div></section>
        <section class="data-panel data-quality"><header><div><span>质量</span><h2>异常与数据源</h2></div><small>${dashboard.anomalies.length} 个异常</small></header><div class="data-anomalies">${dashboard.anomalies.map((item) => `<button type="button" data-data-location="${escapeHtml(item.locationId)}"><strong>${escapeHtml(locationById.get(item.locationId)?.name ?? item.locationId)}</strong><span>${formatNumber(item.value, definition)} · ${escapeHtml(item.reason)}</span></button>`).join('') || '<p>当前周期未检测到异常。</p>'}</div><div class="data-sources">${
          state.dataSources
            .slice(-4)
            .reverse()
            .map(
              (source) =>
                `<div><span><strong>${escapeHtml(source.name)}</strong><small>v${source.version ?? 1} · ${new Date(source.updatedAt).toLocaleString('zh-CN')}</small></span><em data-quality="${source.qualityStatus}">${source.qualityStatus === 'ready' ? '通过' : source.qualityStatus === 'warning' ? `${source.issueCount ?? 0} 提示` : '待处理'}</em></div>`
            )
            .join('') || '<p>尚无文件/API 数据源；示例记录来自 GeoJSON。</p>'
        }</div></section>
      </div>`;
    this.#bindEvents(definition);
  }

  #bindEvents(definition: MetricDefinition): void {
    this.#root?.querySelector('#dataMapToggle')?.addEventListener('click', () => {
      this.#mapView = !this.#mapView;
      this.#render();
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    });
    this.#root?.querySelector('#dataImport')?.addEventListener('click', () => this.#openImport());
    this.#root
      ?.querySelector('#dataAddMetric')
      ?.addEventListener('click', () => this.#openDefinition(definition));
    this.#root
      ?.querySelector<HTMLSelectElement>('#dataMetric')
      ?.addEventListener('change', (event) => {
        this.#metricKey = (event.currentTarget as HTMLSelectElement).value;
        this.#period = '';
        this.#render();
      });
    this.#root
      ?.querySelector<HTMLInputElement>('#dataPeriod')
      ?.addEventListener('change', (event) => {
        this.#period = (event.currentTarget as HTMLInputElement).value;
        this.#render();
      });
    this.#root
      ?.querySelector<HTMLSelectElement>('#dataRegion')
      ?.addEventListener('change', (event) => {
        this.#region = (event.currentTarget as HTMLSelectElement).value;
        window.GeomapLegacyBridge?.applyLocationFilter({
          query: this.#query,
          region: this.#region,
          status: this.#status
        });
        this.#render();
      });
    this.#root?.querySelectorAll<HTMLButtonElement>('[data-data-location]').forEach((button) => {
      button.addEventListener('click', () => {
        const location = this.#workspace
          .getState()
          .locations.find((item) => item.locationId === button.dataset.dataLocation);
        if (location) {
          window.GeomapLegacyBridge?.focusLocation(location.name);
          window.dispatchEvent(
            new CustomEvent('geomap:open-location-detail', {
              detail: { locationId: location.locationId }
            })
          );
        }
      });
    });
    this.#root?.querySelectorAll<HTMLButtonElement>('[data-data-region]').forEach((button) => {
      button.addEventListener('click', () => {
        this.#region = button.dataset.dataRegion ?? 'all';
        window.GeomapLegacyBridge?.applyLocationFilter({
          query: this.#query,
          region: this.#region,
          status: this.#status
        });
        this.#render();
      });
    });
  }

  #openImport(): void {
    if (!this.#dialog) return;
    this.#rows = [];
    this.#columns = [];
    this.#mapping = null;
    this.#preview = null;
    this.#renderImportDialog();
    this.#dialog.showModal();
  }

  #renderImportDialog(): void {
    if (!this.#dialog) return;
    const option = (value: string): string =>
      this.#columns
        .map(
          (column) =>
            `<option value="${escapeHtml(column)}"${column === value ? ' selected' : ''}>${escapeHtml(column)}</option>`
        )
        .join('');
    const errors = this.#preview?.issues.filter((issue) => issue.severity === 'error') ?? [];
    const warnings = this.#preview?.issues.filter((issue) => issue.severity === 'warning') ?? [];
    this.#dialog.innerHTML = `
      <form method="dialog" class="metric-import-shell"><header><div><span>三步导入</span><h2>经营数据字段映射</h2></div><button value="cancel" aria-label="关闭">×</button></header>
      <section class="metric-import-file"><label>1. 选择文件<input id="metricFile" type="file" accept=".csv,.xlsx,.xls" /></label><span>${this.#sourceName ? `${escapeHtml(this.#sourceName)} · ${this.#rows.length} 行 · ${this.#columns.length} 列` : '支持 CSV / Excel，数据不会上传。'}</span></section>
      ${this.#columns.length ? `<section><h3>2. 映射字段</h3><div class="metric-mapping"><label>门店 ID<select name="locationId">${option(this.#mapping?.locationId ?? '')}</select></label><label>周期开始<select name="periodStart">${option(this.#mapping?.periodStart ?? '')}</select></label><label>周期结束<select name="periodEnd"><option value="">按指标周期计算</option>${option(this.#mapping?.periodEnd ?? '')}</select></label><label>指标编码<select name="metricKey">${option(this.#mapping?.metricKey ?? '')}</select></label><label>数值<select name="value">${option(this.#mapping?.value ?? '')}</select></label><label>单位<select name="unit"><option value="">使用指标字典</option>${option(this.#mapping?.unit ?? '')}</select></label><label>目标<select name="target"><option value="">无目标</option>${option(this.#mapping?.target ?? '')}</select></label><button id="metricPreview" type="button">生成质量预览</button></div></section>` : ''}
      ${
        this.#preview
          ? `<section class="metric-quality-report"><h3>3. 质量报告</h3><div class="metric-quality-kpis"><span>文件行数 <strong>${this.#preview.totalRows}</strong></span><span>可入库 <strong>${this.#preview.validRows.length}</strong></span><span>错误 <strong>${errors.length}</strong></span><span>提示 <strong>${warnings.length}</strong></span></div><div class="metric-issues">${
              this.#preview.issues
                .slice(0, 8)
                .map(
                  (issue) =>
                    `<div data-severity="${issue.severity}"><strong>第 ${issue.row} 行 · ${issue.code}</strong><span>${escapeHtml(issue.message)}</span></div>`
                )
                .join('') || '<p>未发现缺失、重复、匹配或数值问题。</p>'
            }</div><div class="metric-import-commit"><label>重复主键<select id="metricDuplicatePolicy"><option value="update">保留原记录并新增修订</option><option value="skip">跳过已有记录</option><option value="error">发现重复即阻止</option></select></label><button id="metricCommit" class="is-primary" type="button" ${errors.length ? 'disabled' : ''}>确认入库</button></div></section>`
          : ''
      }
      </form>`;
    this.#dialog
      .querySelector<HTMLInputElement>('#metricFile')
      ?.addEventListener('change', (event) => {
        void this.#readFile((event.currentTarget as HTMLInputElement).files?.[0]);
      });
    this.#dialog.querySelector('#metricPreview')?.addEventListener('click', () => {
      this.#mapping = this.#readMapping();
      this.#preview = previewMetricImport(
        this.#sourceName,
        this.#rows,
        this.#mapping,
        this.#workspace.getState().locations,
        this.#metrics.definitions(),
        this.#workspace.getState().records
      );
      this.#renderImportDialog();
    });
    this.#dialog.querySelector('#metricCommit')?.addEventListener('click', () => {
      if (!this.#preview || !this.#mapping) return;
      try {
        const policy = this.#dialog?.querySelector<HTMLSelectElement>('#metricDuplicatePolicy')
          ?.value as 'update' | 'skip' | 'error';
        const result = this.#metrics.importPreview(
          this.#preview,
          policy,
          this.#mapping,
          this.#columns
        );
        this.#message = `已入库 ${result.inserted} 条，修订 ${result.updated} 条，跳过 ${result.skipped} 条；来源版本 v${result.source.version}。`;
        this.#dialog?.close();
        this.#render();
      } catch (error) {
        this.#message = (error as Error).message;
        this.#dialog?.close();
        this.#render();
      }
    });
  }

  async #readFile(file?: File): Promise<void> {
    if (!file) return;
    this.#sourceName = file.name;
    if (/\.csv$/i.test(file.name)) this.#rows = parseCsvTable(await file.text());
    else {
      const xlsx = window.XLSX;
      if (!xlsx) throw new Error('Excel 解析组件未就绪，请刷新后重试。');
      const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
      this.#rows = sheet ? (xlsx.utils.sheet_to_json(sheet, { defval: '' }) as TabularRow[]) : [];
    }
    this.#columns = Object.keys(this.#rows[0] ?? {});
    this.#mapping = {
      locationId: automaticColumn(this.#columns, ['locationId', '门店ID', '门店编号']),
      periodStart: automaticColumn(this.#columns, ['periodStart', '周期', '月份', '日期']),
      periodEnd: automaticColumn(this.#columns, ['periodEnd', '周期结束'], false),
      metricKey: automaticColumn(this.#columns, ['metricKey', '指标编码', '指标']),
      value: automaticColumn(this.#columns, ['value', '数值', '实际']),
      unit: automaticColumn(this.#columns, ['unit', '单位'], false),
      target: automaticColumn(this.#columns, ['target', '目标'], false)
    };
    this.#renderImportDialog();
  }

  #readMapping(): MetricImportMapping {
    const value = (name: string): string =>
      this.#dialog?.querySelector<HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';
    return {
      locationId: value('locationId'),
      periodStart: value('periodStart'),
      periodEnd: value('periodEnd') || undefined,
      metricKey: value('metricKey'),
      value: value('value'),
      unit: value('unit') || undefined,
      target: value('target') || undefined
    };
  }

  #openDefinition(definition: MetricDefinition): void {
    if (!this.#dialog) return;
    this.#dialog.innerHTML = `<form id="metricDefinitionForm" class="metric-import-shell"><header><div><span>统一口径</span><h2>指标字典</h2></div><button type="button" data-close>×</button></header><section class="metric-definition-grid"><label>指标编码<input name="metricKey" value="${escapeHtml(definition.metricKey)}" /></label><label>指标名称<input name="name" value="${escapeHtml(definition.name)}" /></label><label>单位<input name="unit" value="${escapeHtml(definition.unit)}" /></label><label>周期<select name="periodicity">${['day', 'week', 'month', 'quarter', 'year'].map((value) => `<option value="${value}"${definition.periodicity === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label><label>聚合<select name="aggregation">${['sum', 'average', 'latest', 'minimum', 'maximum'].map((value) => `<option value="${value}"${definition.aggregation === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label><label>格式<select name="format">${['number', 'currency', 'percent'].map((value) => `<option value="${value}"${definition.format === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label><label>健康下限<input name="healthyMin" type="number" value="${definition.healthyMin ?? ''}" /></label><label>健康上限<input name="healthyMax" type="number" value="${definition.healthyMax ?? ''}" /></label><label class="metric-definition-description">口径说明<input name="description" value="${escapeHtml(definition.description)}" /></label><button class="is-primary" type="submit">保存指标口径</button></section></form>`;
    this.#dialog
      .querySelector('[data-close]')
      ?.addEventListener('click', () => this.#dialog?.close());
    this.#dialog.querySelector('#metricDefinitionForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      const number = (name: string): number | undefined => {
        const raw = String(data.get(name) ?? '');
        return raw ? Number(raw) : undefined;
      };
      this.#metrics.saveDefinition({
        metricKey: String(data.get('metricKey') ?? '').trim(),
        name: String(data.get('name') ?? '').trim(),
        unit: String(data.get('unit') ?? '').trim(),
        periodicity: String(data.get('periodicity')) as MetricDefinition['periodicity'],
        aggregation: String(data.get('aggregation')) as MetricDefinition['aggregation'],
        format: String(data.get('format')) as MetricDefinition['format'],
        description: String(data.get('description') ?? '').trim(),
        healthyMin: number('healthyMin'),
        healthyMax: number('healthyMax')
      });
      this.#dialog?.close();
      this.#render();
    });
    this.#dialog.showModal();
  }
}
