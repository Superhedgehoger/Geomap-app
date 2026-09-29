import type { GeomapFeatureStore } from '../store/feature-store';
import type { LocationEntity, LocationStatus } from '../types';

type ShellMode = 'view' | 'edit';
type ShellSection = 'overview' | 'network' | 'history' | 'selection' | 'data' | 'collaboration';

const SECTION_HELP: Record<ShellSection, string> = {
  overview: '经营总览 · 查看门店规模、经营状态与区域分布',
  network: '门店网络 · 筛选和定位门店；维护地图请点「编辑地图」',
  history: '历史复盘 · 录入经营事件、回放历史、比较不同时间',
  selection: '选址分析 · 配置自定义模型，比较候选位置',
  data: '经营数据 · 导入营业额等指标；位置文件请在地图工作台导入',
  collaboration: '团队协作 · 共享工作区、分配经营事项、跟进进展'
};

const STATUS_LABELS: Record<LocationStatus, string> = {
  planned: '计划',
  preparing: '筹备',
  open: '在营',
  paused: '停业',
  closed: '闭店',
  unknown: '未知'
};

function button(
  label: string,
  options: { active?: boolean; disabled?: boolean; section?: ShellSection } = {}
): string {
  const { active = false, disabled = false, section } = options;
  return `<button class="decision-nav-item${active ? ' is-active' : ''}" type="button"${active ? ' aria-current="page"' : ''}${section ? ` data-section="${section}"` : ''}${disabled ? ' disabled title="当前版本未启用此功能"' : ''}>${label}${disabled ? '<span>未启用</span>' : ''}</button>`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return `更新于 ${date.toLocaleString('zh-CN', { hour12: false })}`;
}

export class DecisionShell {
  readonly #store: GeomapFeatureStore;
  readonly #historyEnabled: boolean;
  readonly #selectionEnabled: boolean;
  readonly #dataEnabled: boolean;
  readonly #collaborationEnabled: boolean;
  #mode: ShellMode = 'view';
  #section: ShellSection = 'overview';
  #query = '';
  #region = 'all';
  #status = 'all';
  #root: HTMLElement | null = null;
  #insights: HTMLElement | null = null;
  #returnButton: HTMLButtonElement | null = null;
  #revealButton: HTMLButtonElement | null = null;
  #insightsRevealButton: HTMLButtonElement | null = null;
  #shellCollapsed = false;
  #insightsCollapsed = false;
  #historicalLocations: LocationEntity[] | null = null;

  constructor(
    store: GeomapFeatureStore,
    historyEnabled = true,
    selectionEnabled = true,
    dataEnabled = true,
    collaborationEnabled = true
  ) {
    this.#store = store;
    this.#historyEnabled = historyEnabled;
    this.#selectionEnabled = selectionEnabled;
    this.#dataEnabled = dataEnabled;
    this.#collaborationEnabled = collaborationEnabled;
  }

  mount(): void {
    if (document.getElementById('decisionShell')) return;
    this.#mode = sessionStorage.getItem('geomap.shell.mode') === 'edit' ? 'edit' : 'view';
    this.#shellCollapsed = sessionStorage.getItem('geomap.shell.collapsed') === 'true';
    this.#insightsCollapsed = sessionStorage.getItem('geomap.insights.collapsed') === 'true';
    this.#root = document.createElement('header');
    this.#root.id = 'decisionShell';
    this.#root.className = 'decision-shell';
    this.#root.setAttribute('aria-label', '经营决策工作台');
    document.body.prepend(this.#root);

    this.#insights = document.createElement('aside');
    this.#insights.id = 'decisionInsights';
    this.#insights.className = 'decision-insights';
    this.#insights.setAttribute('aria-label', '门店网络洞察');
    document.body.append(this.#insights);

    this.#returnButton = document.createElement('button');
    this.#returnButton.id = 'decisionReturnBtn';
    this.#returnButton.className = 'decision-return-btn';
    this.#returnButton.type = 'button';
    this.#returnButton.innerHTML =
      '<i class="fa-solid fa-arrow-left"></i><span>返回决策首页</span>';
    this.#returnButton.addEventListener('click', () => this.#setMode('view'));
    document.body.append(this.#returnButton);

    this.#revealButton = document.createElement('button');
    this.#revealButton.id = 'decisionShellRevealBtn';
    this.#revealButton.className = 'decision-shell-reveal-btn';
    this.#revealButton.type = 'button';
    this.#revealButton.innerHTML = '<i class="fa-solid fa-bars"></i><span>显示顶部菜单</span>';
    this.#revealButton.addEventListener('click', () => this.#setShellCollapsed(false));
    document.body.append(this.#revealButton);

    this.#insightsRevealButton = document.createElement('button');
    this.#insightsRevealButton.id = 'decisionInsightsRevealBtn';
    this.#insightsRevealButton.className = 'decision-insights-reveal-btn';
    this.#insightsRevealButton.type = 'button';
    this.#insightsRevealButton.innerHTML =
      '<i class="fa-solid fa-chart-pie"></i><span>显示经营总览</span>';
    this.#insightsRevealButton.addEventListener('click', () => this.#setInsightsCollapsed(false));
    document.body.append(this.#insightsRevealButton);

    document.body.classList.add('decision-shell-enabled');
    this.#applyMode();
    this.#applyShellVisibility();
    this.#applyInsightsVisibility();
    this.#render();
    this.#store.subscribe(() => this.#render());
    window.addEventListener('geomap:history-state-changed', (event) => {
      const detail = (event as CustomEvent<{ locations?: LocationEntity[] | null }>).detail;
      this.#historicalLocations = detail?.locations ? structuredClone(detail.locations) : null;
      this.#render();
    });
    window.addEventListener('geomap:navigate-section', (event) => {
      const section = (event as CustomEvent<{ section?: ShellSection }>).detail?.section;
      if (
        !section ||
        !['overview', 'network', 'history', 'selection', 'data', 'collaboration'].includes(section)
      )
        return;
      this.#section = section;
      this.#render();
      window.dispatchEvent(new CustomEvent('geomap:section-changed', { detail: { section } }));
    });
    window.addEventListener('resize', () => window.dispatchEvent(new Event('geomap:layout')));
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  }

  #filteredLocations(): LocationEntity[] {
    const query = this.#query.trim().toLowerCase();
    const source = this.#historicalLocations ?? this.#store.getState().locations;
    return source.filter((location) => {
      const matchesQuery =
        !query ||
        `${location.name} ${location.address ?? ''} ${location.region ?? ''}`
          .toLowerCase()
          .includes(query);
      return (
        matchesQuery &&
        (this.#region === 'all' || location.region === this.#region) &&
        (this.#status === 'all' || location.status === this.#status)
      );
    });
  }

  #render(): void {
    if (!this.#root || !this.#insights) return;
    document.body.classList.toggle(
      'decision-workspace-section',
      ['selection', 'data', 'collaboration'].includes(this.#section)
    );
    const state = this.#store.getState();
    const locations = this.#filteredLocations();
    const sourceLocations = this.#historicalLocations ?? state.locations;
    const allRegions = [
      ...new Set(sourceLocations.map((item) => item.region).filter(Boolean))
    ].sort();
    const openCount = locations.filter((item) => item.status === 'open').length;
    const candidateCount = locations.filter(
      (item) =>
        item.kind === 'candidate' || item.status === 'planned' || item.status === 'preparing'
    ).length;
    const closedCount = locations.filter((item) => item.status === 'closed').length;
    const regionCount = new Set(locations.map((item) => item.region).filter(Boolean)).size;

    this.#root.innerHTML = `
      <div class="decision-shell-topline">
        <div class="decision-brand"><i class="fa-solid fa-map-location-dot"></i><span>Geomap</span><strong>经营决策地图</strong></div>
        <nav class="decision-nav" aria-label="主要功能">
          <div class="decision-nav-group" role="group" aria-label="经营分析">
          ${button('经营总览', { active: this.#section === 'overview', section: 'overview' })}
          ${button('门店网络', { active: this.#section === 'network', section: 'network' })}
          ${button('历史复盘', {
            active: this.#section === 'history',
            disabled: !this.#historyEnabled,
            section: this.#historyEnabled ? 'history' : undefined
          })}
          ${button('选址分析', {
            active: this.#section === 'selection',
            disabled: !this.#selectionEnabled,
            section: this.#selectionEnabled ? 'selection' : undefined
          })}
          </div><div class="decision-nav-group decision-nav-management" role="group" aria-label="数据与团队">
          ${button('经营数据', {
            active: this.#section === 'data',
            disabled: !this.#dataEnabled,
            section: this.#dataEnabled ? 'data' : undefined
          })}
          ${button('团队协作', {
            active: this.#section === 'collaboration',
            disabled: !this.#collaborationEnabled,
            section: this.#collaborationEnabled ? 'collaboration' : undefined
          })}
          </div>
        </nav>
        <div class="decision-shell-actions">
          <span class="decision-freshness">${formatUpdatedAt(state.updatedAt)}</span>
          <button id="decisionModeBtn" class="decision-mode-btn" type="button" title="打开地图工作台：导入位置、维护点位、编辑地图"><i class="fa-solid fa-pen-to-square"></i>编辑地图</button>
          <button id="decisionShellHideBtn" class="decision-shell-hide-btn" type="button" aria-label="隐藏顶部菜单" title="隐藏顶部菜单"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
      </div>
      <div class="decision-section-context">${SECTION_HELP[this.#section]}</div>
      <div class="decision-shell-dashboard"${['selection', 'data', 'collaboration'].includes(this.#section) ? ' hidden' : ''}>
        <div class="decision-filters">
          <label><span>搜索</span><input id="decisionSearch" value="${this.#escapeAttribute(this.#query)}" placeholder="门店、区域或地址" /></label>
          <label><span>区域</span><select id="decisionRegion"><option value="all">全部区域</option>${allRegions.map((region) => `<option value="${this.#escapeAttribute(region!)}"${region === this.#region ? ' selected' : ''}>${region}</option>`).join('')}</select></label>
          <label><span>状态</span><select id="decisionStatus"><option value="all">全部状态</option>${Object.entries(
            STATUS_LABELS
          )
            .map(
              ([value, label]) =>
                `<option value="${value}"${value === this.#status ? ' selected' : ''}>${label}</option>`
            )
            .join('')}</select></label>
        </div>
        <div class="decision-kpis" aria-label="门店网络概览">
          <article><span>位置总数</span><strong>${locations.length}</strong></article>
          <article><span>在营门店</span><strong>${openCount}</strong></article>
          <article><span>候选/筹备</span><strong>${candidateCount}</strong></article>
          <article><span>闭店</span><strong>${closedCount}</strong></article>
          <article><span>覆盖区域</span><strong>${regionCount}</strong></article>
        </div>
      </div>`;

    const regionSummary = [...new Set(locations.map((item) => item.region).filter(Boolean))]
      .map((region) => ({
        region: region!,
        count: locations.filter((item) => item.region === region).length
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 4);
    const missingRegion = locations.filter((item) => !item.region).length;
    this.#insights.innerHTML = `
      <div class="decision-insights-header"><div><span>${this.#section === 'overview' ? '经营总览' : this.#section === 'network' ? '门店网络' : this.#section === 'history' ? '历史状态' : this.#section === 'selection' ? '选址模型' : this.#section === 'collaboration' ? '企业协作' : '经营数据'}</span><strong>${locations.length} 个位置</strong></div><span class="decision-mode-tag">${this.#section === 'history' ? '时间上下文' : this.#section === 'selection' ? '模型情景' : this.#section === 'data' ? '指标口径' : this.#section === 'collaboration' ? '私有空间' : this.#mode === 'view' ? '查看模式' : '编辑模式'}</span><button id="decisionInsightsHideBtn" class="decision-insights-hide-btn" type="button" aria-label="隐藏经营总览" title="隐藏经营总览"><i class="fa-solid fa-chevron-right"></i></button></div>
      <section><h2>区域分布</h2>${regionSummary.length ? regionSummary.map((item) => `<button type="button" data-region="${this.#escapeAttribute(item.region)}"><span>${item.region}</span><strong>${item.count}</strong></button>`).join('') : '<p>暂无区域字段</p>'}</section>
      <section><h2>数据提示</h2><p>${missingRegion > 0 ? `${missingRegion} 个位置缺少区域，请在点位属性中补充。` : '区域字段完整，可用于管理筛选。'}</p><p>${this.#section === 'history' ? '地图与指标已使用底部时间轴的同一历史状态。' : '进入历史复盘可回放事件并比较两个时间点。'}</p></section>
      <section><h2>位置列表</h2><div class="decision-location-list">${
        locations
          .slice(0, 6)
          .map(
            (item) =>
              `<div class="decision-location-row"><button type="button" data-location-id="${this.#escapeAttribute(item.locationId)}" aria-label="查看${this.#escapeAttribute(item.name)}详情"><span><strong>${this.#escapeAttribute(item.name)}</strong><small>${this.#escapeAttribute(item.region ?? '未分区')}</small></span><em data-status="${item.status}">${STATUS_LABELS[item.status]}</em></button>${this.#section === 'history' ? `<button type="button" class="decision-add-record" data-add-record="${this.#escapeAttribute(item.locationId)}" aria-label="为${this.#escapeAttribute(item.name)}新增记录">+记录</button>` : ''}</div>`
          )
          .join('') || '<p>当前筛选无结果</p>'
      }</div></section>`;

    this.#bindEvents();
  }

  #bindEvents(): void {
    this.#insights?.querySelector('#decisionInsightsHideBtn')?.addEventListener('click', () => {
      this.#setInsightsCollapsed(true);
    });
    this.#root?.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((item) => {
      item.addEventListener('click', () => {
        this.#section =
          item.dataset.section === 'network'
            ? 'network'
            : item.dataset.section === 'history'
              ? 'history'
              : item.dataset.section === 'selection'
                ? 'selection'
                : item.dataset.section === 'data'
                  ? 'data'
                  : item.dataset.section === 'collaboration'
                    ? 'collaboration'
                    : 'overview';
        this.#render();
        window.dispatchEvent(
          new CustomEvent('geomap:section-changed', { detail: { section: this.#section } })
        );
      });
    });
    this.#root?.querySelector('#decisionModeBtn')?.addEventListener('click', () => {
      this.#setMode('edit');
    });
    this.#root?.querySelector('#decisionShellHideBtn')?.addEventListener('click', () => {
      this.#setShellCollapsed(true);
    });
    this.#root
      ?.querySelector<HTMLInputElement>('#decisionSearch')
      ?.addEventListener('input', (event) => {
        this.#query = (event.currentTarget as HTMLInputElement).value;
        this.#applyFilter();
        this.#render();
        const nextInput = this.#root?.querySelector<HTMLInputElement>('#decisionSearch');
        nextInput?.focus();
        nextInput?.setSelectionRange(this.#query.length, this.#query.length);
      });
    this.#root
      ?.querySelector<HTMLSelectElement>('#decisionRegion')
      ?.addEventListener('change', (event) => {
        this.#region = (event.currentTarget as HTMLSelectElement).value;
        this.#applyFilter();
        this.#render();
      });
    this.#root
      ?.querySelector<HTMLSelectElement>('#decisionStatus')
      ?.addEventListener('change', (event) => {
        this.#status = (event.currentTarget as HTMLSelectElement).value;
        this.#applyFilter();
        this.#render();
      });
    this.#insights?.querySelectorAll<HTMLButtonElement>('[data-region]').forEach((item) => {
      item.addEventListener('click', () => {
        this.#region = item.dataset.region ?? 'all';
        this.#applyFilter();
        this.#render();
      });
    });
    this.#insights?.querySelectorAll<HTMLButtonElement>('[data-location-id]').forEach((item) => {
      item.addEventListener('click', () => {
        const locationId = item.dataset.locationId ?? '';
        const location = this.#store
          .getState()
          .locations.find((value) => value.locationId === locationId);
        if (location) window.GeomapLegacyBridge?.focusLocation(location.name);
        window.dispatchEvent(
          new CustomEvent('geomap:open-location-detail', { detail: { locationId } })
        );
      });
    });
    this.#insights?.querySelectorAll<HTMLButtonElement>('[data-add-record]').forEach((item) => {
      item.addEventListener('click', () => {
        window.dispatchEvent(
          new CustomEvent('geomap:add-record', {
            detail: { locationId: item.dataset.addRecord ?? '' }
          })
        );
      });
    });
  }

  #applyFilter(): void {
    const detail = {
      query: this.#query,
      region: this.#region,
      status: this.#status
    };
    window.GeomapLegacyBridge?.applyLocationFilter(detail);
    window.dispatchEvent(new CustomEvent('geomap:location-filter-changed', { detail }));
  }

  #applyMode(): void {
    document.body.classList.toggle('decision-view-mode', this.#mode === 'view');
    document.body.classList.toggle('decision-edit-mode', this.#mode === 'edit');
  }

  #applyShellVisibility(): void {
    document.body.classList.toggle('decision-shell-collapsed', this.#shellCollapsed);
  }

  #setShellCollapsed(collapsed: boolean): void {
    this.#shellCollapsed = collapsed;
    sessionStorage.setItem('geomap.shell.collapsed', String(collapsed));
    this.#applyShellVisibility();
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  }

  #applyInsightsVisibility(): void {
    document.body.classList.toggle('decision-insights-collapsed', this.#insightsCollapsed);
  }

  #setInsightsCollapsed(collapsed: boolean): void {
    this.#insightsCollapsed = collapsed;
    sessionStorage.setItem('geomap.insights.collapsed', String(collapsed));
    this.#applyInsightsVisibility();
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  }

  #setMode(mode: ShellMode): void {
    this.#mode = mode;
    sessionStorage.setItem('geomap.shell.mode', this.#mode);
    this.#section = mode === 'edit' ? 'network' : 'overview';
    window.dispatchEvent(
      new CustomEvent('geomap:section-changed', { detail: { section: this.#section } })
    );
    this.#applyMode();
    this.#render();
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  }

  #escapeAttribute(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
