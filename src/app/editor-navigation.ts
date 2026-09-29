/** Reuse legacy controls and their listeners; each action has one home. */
export function mountEditorNavigation(): void {
  const root = document.querySelector<HTMLElement>('#controls .panel-content');
  if (!root || root.querySelector('.editor-task-nav')) return;
  const tasks = [
    ['map', '地图', '查找位置、切换底图和调整地图显示。', 'fa-map'],
    ['points', '点位', '添加点位或绘图；修改已有点位请点击地图上的标记。', 'fa-map-pin'],
    [
      'files',
      '文件',
      '导入位置文件或导出地图；营业额等经营指标请到首页「经营数据」。',
      'fa-file-import'
    ],
    [
      'snapshots',
      '快照',
      '保存和切换地图版本；门店开闭店等业务事件请到首页「历史复盘」。',
      'fa-clock-rotate-left'
    ],
    ['settings', '设置', '显示字段、代码编辑和数据清理。', 'fa-sliders']
  ] as const;
  const nav = document.createElement('div');
  nav.className = 'editor-task-nav';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', '地图工作台功能');
  const panels = new Map<string, HTMLElement>();
  for (const [id, label, description] of tasks) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = `editor-tab-${id}`;
    tab.textContent = label;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `editor-panel-${id}`);
    tab.dataset.task = id;
    nav.append(tab);
    const panel = document.createElement('section');
    panel.id = `editor-panel-${id}`;
    panel.className = 'editor-task-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    const hint = document.createElement('p');
    hint.className = 'editor-task-hint';
    hint.textContent = description;
    panel.append(hint);
    panels.set(id, panel);
  }
  const move = (task: string, selector: string, group = false): void => {
    const node = root.querySelector(selector);
    const target = group ? node?.closest('.control-group') : node;
    if (target) panels.get(task)!.append(target);
  };
  move('map', '#btn-show-layer-panel');
  move('map', '#toggleCompactLabelsBtn');
  move('map', '#toggleClusterBtn');
  move('map', '.map-control-buttons');
  move('map', '#accordion-search');
  move('points', '#toggleDrawToolbarBtn');
  move('points', '#manualNote', true);
  move('points', '#markerIconSelect', true);
  move('points', '#togglePickerBtn', true);
  move('files', '#accordion-data');
  move('snapshots', '#accordion-history');
  move('settings', '#toggleEditorBtn', true);
  move('settings', '[onclick="openPopupConfigModal()"]', true);
  move('settings', '#showLabelsCheck', true);
  const cleanup = document.createElement('details');
  cleanup.className = 'editor-cleanup';
  const summary = document.createElement('summary');
  summary.textContent = '清理地图数据';
  const warning = document.createElement('p');
  warning.textContent = '清空前请先在「文件」中导出备份。此操作会移除当前地图的所有图层。';
  cleanup.append(summary, warning);
  const clear = root.querySelector('#btn-clear-all-layers');
  if (clear) cleanup.append(clear);
  panels.get('settings')!.append(cleanup);
  // These containers are now empty; original action nodes (and listeners) survive.
  root.replaceChildren(nav, ...panels.values());
  root.classList.add('editor-organized');
  const title = document.querySelector('#controls .panel-header h2');
  if (title) title.textContent = '地图工作台';
  const select = (id: string, focus = false): void => {
    if (!panels.has(id)) return;
    for (const [key, panel] of panels) panel.hidden = key !== id;
    nav.querySelectorAll<HTMLButtonElement>('button').forEach((tab) => {
      const active = tab.dataset.task === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    root.scrollTop = 0;
    window.dispatchEvent(new CustomEvent('geomap:editor-task-changed', { detail: id }));
  };
  nav.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLButtonElement>('[data-task]');
    if (tab?.dataset.task) select(tab.dataset.task);
  });
  nav.addEventListener('keydown', (event) => {
    const index = tasks.findIndex(([id]) => id === (event.target as HTMLElement).dataset.task);
    if (index < 0) return;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tasks.length
        : event.key === 'ArrowLeft'
          ? (index + tasks.length - 1) % tasks.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tasks.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const task = tasks[next];
    if (task) select(task[0], true);
  });
  const dock = document.querySelector('#controls .dock-icons');
  if (dock) {
    dock.replaceChildren();
    for (const [id, label, , icon] of tasks) {
      const shortcut = document.createElement('button');
      shortcut.type = 'button';
      shortcut.className = 'dock-icon';
      shortcut.dataset.tooltip = label;
      shortcut.setAttribute('aria-label', `打开${label}`);
      shortcut.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
      shortcut.addEventListener('click', () => {
        document.getElementById('controls')?.classList.remove('collapsed');
        document.body.classList.remove('ui-collapsed');
        select(id, true);
      });
      dock.append(shortcut);
    }
  }
  window.addEventListener('geomap:editor-section', (event) => {
    const section = (event as CustomEvent<string>).detail;
    select(
      { search: 'map', data: 'files', history: 'snapshots', tools: 'points' }[section] ?? 'map'
    );
  });
  select('map');
}
