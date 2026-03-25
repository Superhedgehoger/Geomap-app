// ==== Popup Config Module - 弹出信息字段自定义模块 ==== //
// 控制标记点击后 Leaflet Popup 中显示哪些字段及其顺序。

const POPUP_CONFIG_KEY = 'geomap_popup_config';

/**
 * 默认弹出字段配置
 * key: 内部唯一键名
 * label: 展示给用户的标签名
 * aliases: 从 marker.feature.properties 中读取值时的别名列表（按优先级排序）
 * special: 特殊字段标识（'coords' = 经纬度）
 * enabled: 是否默认显示
 * builtIn: 是否为内置字段（内置字段不可删除）
 */
const DEFAULT_POPUP_FIELDS = [
    { key: 'name',    label: '名称',   aliases: ['名称', 'name', 'title'],             special: null,     enabled: true,  builtIn: true  },
    { key: 'type',    label: '类型',   aliases: ['类型', 'type', 'category'],           special: null,     enabled: true,  builtIn: true  },
    { key: 'address', label: '地址',   aliases: ['地址', 'address', 'location'],        special: null,     enabled: true,  builtIn: true  },
    { key: '_coords', label: '经纬度', aliases: [],                                      special: 'coords', enabled: true,  builtIn: true  },
];

/**
 * 从 localStorage 加载用户的弹出字段配置
 * @returns {Array} 字段配置数组
 */
function loadPopupConfig() {
    try {
        const stored = localStorage.getItem(POPUP_CONFIG_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // 补全缺失的内置字段（若版本升级添加了新内置字段）
                DEFAULT_POPUP_FIELDS.forEach(def => {
                    if (!parsed.find(f => f.key === def.key)) {
                        parsed.push({ ...def });
                    }
                });
                return parsed;
            }
        }
    } catch (e) {
        console.warn('[PopupConfig] 读取配置失败，使用默认配置:', e);
    }
    return DEFAULT_POPUP_FIELDS.map(f => ({ ...f }));
}

/**
 * 保存弹出字段配置到 localStorage
 * @param {Array} config 字段配置数组
 */
function savePopupConfig(config) {
    try {
        localStorage.setItem(POPUP_CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
        console.warn('[PopupConfig] 保存配置失败:', e);
    }
}

/**
 * 从 marker properties 中读取某字段值（按 aliases 优先级）
 * @param {Object} props
 * @param {string[]} aliases
 * @returns {string}
 */
function getFieldValue(props, aliases) {
    for (const alias of aliases) {
        const val = props[alias];
        if (val !== undefined && val !== null && val !== '') {
            return String(val);
        }
    }
    return '';
}

/**
 * 根据当前配置动态生成 Popup HTML
 * @param {L.Marker} marker
 * @returns {string} HTML 字符串
 */
function renderMarkerPopupHtml(marker) {
    const props = marker.feature?.properties || {};
    const latlng = marker.getLatLng();
    const config = loadPopupConfig();

    // 获取标记名称（始终用于标题，无论 name 字段是否在列表中）
    const titleName = getFieldValue(props, ['名称', 'name', 'title']) ||
                      marker.options.name || '未命名标记';

    // 生成字段行 HTML
    const fieldsHtml = config
        .filter(f => f.enabled)
        .map(f => {
            if (f.special === 'coords') {
                // NOTE: 经纬度特殊处理
                const lat = latlng.lat.toFixed(6);
                const lng = latlng.lng.toFixed(6);
                return `
                    <div class="popup-field-row">
                        <span class="popup-field-label">${f.label}</span>
                        <span class="popup-field-value popup-coords">
                            ${lat}, ${lng}
                            <button class="btn-copy-coords"
                                onclick="navigator.clipboard.writeText('${lat},${lng}'); showBriefMessage('✅ 坐标已复制')"
                                title="复制坐标">📋</button>
                        </span>
                    </div>`;
            }
            // 内置字段用 aliases 读值；自定义字段直接用 key 读值
            const value = f.aliases && f.aliases.length > 0
                ? getFieldValue(props, f.aliases)
                : (props[f.key] !== undefined ? String(props[f.key]) : '');

            if (!value) return '';  // 值为空则不渲染该行
            return `
                <div class="popup-field-row">
                    <span class="popup-field-label">${f.label}</span>
                    <span class="popup-field-value">${value}</span>
                </div>`;
        })
        .filter(Boolean)
        .join('');

    // 获取事件列表 HTML（保留原有逻辑）
    const events = props.events || [];
    let eventListHtml = '';
    if (events.length > 0) {
        const recentEvents = events.slice(-3).reverse();
        eventListHtml = `<div class="popup-events">
            <div class="popup-events-header">📋 最近事件 (${events.length})</div>
            ${recentEvents.map(evt => `
                <div class="popup-event-item">
                    <span class="popup-event-date">${evt.created?.split('T')[0] || '无日期'}</span>
                    <span class="popup-event-name">${evt.eventName || '未命名事件'}</span>
                </div>
            `).join('')}
            ${events.length > 3 ? `<div class="popup-event-more">还有 ${events.length - 3} 个事件...</div>` : ''}
        </div>`;
    }

    return `<div class="marker-popup">
        <h3 class="popup-title">${titleName}</h3>
        <div class="popup-fields">
            ${fieldsHtml || '<span class="popup-no-fields">（无启用字段）</span>'}
        </div>
        ${eventListHtml}
    </div>`;
}

// ==== Popup Config UI 逻辑 ==== //

/**
 * 打开弹出信息配置弹窗
 */
function openPopupConfigModal() {
    const modal = document.getElementById('popupConfigModal');
    if (!modal) return;
    renderPopupConfigList();
    modal.style.display = 'flex';
    // 填充已知属性键到 datalist
    populateKnownFieldsDatalist();
}

/**
 * 关闭弹出信息配置弹窗
 */
function closePopupConfigModal() {
    const modal = document.getElementById('popupConfigModal');
    if (modal) modal.style.display = 'none';
}

/**
 * 渲染配置列表
 */
function renderPopupConfigList() {
    const container = document.getElementById('popupFieldList');
    if (!container) return;

    const config = loadPopupConfig();
    container.innerHTML = config.map((field, idx) => `
        <div class="popup-config-row" data-idx="${idx}">
            <label class="popup-config-toggle">
                <input type="checkbox" ${field.enabled ? 'checked' : ''}
                    onchange="togglePopupField(${idx}, this.checked)">
                <span class="toggle-slider"></span>
            </label>
            <span class="popup-config-label">${field.label}</span>
            <span class="popup-config-key">${field.key}</span>
            ${!field.builtIn ? `
                <button class="popup-config-del-btn" onclick="deletePopupField(${idx})" title="删除">✕</button>
            ` : '<span class="popup-config-builtin">内置</span>'}
        </div>
    `).join('');
}

/**
 * 切换字段的 enabled 状态
 */
function togglePopupField(idx, enabled) {
    const config = loadPopupConfig();
    if (config[idx]) {
        config[idx].enabled = enabled;
        savePopupConfig(config);
    }
}

/**
 * 删除自定义字段
 */
function deletePopupField(idx) {
    const config = loadPopupConfig();
    if (config[idx] && !config[idx].builtIn) {
        config.splice(idx, 1);
        savePopupConfig(config);
        renderPopupConfigList();
    }
}

/**
 * 添加新的自定义字段
 */
function addPopupField() {
    const keyInput = document.getElementById('newPopupFieldKey');
    const labelInput = document.getElementById('newPopupFieldLabel');
    if (!keyInput || !labelInput) return;

    const key = keyInput.value.trim();
    const label = labelInput.value.trim() || key;

    if (!key) {
        keyInput.focus();
        return;
    }

    const config = loadPopupConfig();
    // 重复检查
    if (config.find(f => f.key === key)) {
        showBriefMessage('⚠️ 字段已存在：' + key);
        return;
    }

    config.push({ key, label, aliases: [key], special: null, enabled: true, builtIn: false });
    savePopupConfig(config);
    renderPopupConfigList();
    keyInput.value = '';
    labelInput.value = '';
    showBriefMessage('✅ 已添加字段：' + label);
}

/**
 * 收集当前所有标记的属性键名，填充到 datalist 供用户选择
 */
function populateKnownFieldsDatalist() {
    const datalist = document.getElementById('knownFieldKeys');
    if (!datalist) return;

    const keys = new Set();
    const skipKeys = new Set(['_originalLat', '_originalLng', '_offsetIndex', 'marker-color', 'marker-symbol', 'marker-size', 'events', 'radiusRings']);

    const collectFromLayer = (layer) => {
        if (layer instanceof L.Marker && layer.feature?.properties) {
            Object.keys(layer.feature.properties).forEach(k => {
                if (!k.startsWith('_') && !k.startsWith('marker-') && !skipKeys.has(k)) {
                    keys.add(k);
                }
            });
        }
    };

    if (typeof drawnItems !== 'undefined' && drawnItems) drawnItems.eachLayer(collectFromLayer);
    if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) markerClusterGroup.eachLayer(collectFromLayer);

    datalist.innerHTML = [...keys].map(k => `<option value="${k}">`).join('');
}

/**
 * 保存配置并刷新所有 popup
 */
function saveAndRefreshPopups() {
    // 立即刷新所有标记的 popup（使其使用最新配置）
    const refreshLayer = (layer) => {
        if (layer instanceof L.Marker && typeof bindMarkerPopup === 'function') {
            bindMarkerPopup(layer);
        }
    };
    if (typeof drawnItems !== 'undefined' && drawnItems) drawnItems.eachLayer(refreshLayer);
    if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) markerClusterGroup.eachLayer(refreshLayer);

    closePopupConfigModal();
    showBriefMessage('✅ 弹出信息配置已保存');
}

// 暴露到全局
window.openPopupConfigModal = openPopupConfigModal;
window.closePopupConfigModal = closePopupConfigModal;
window.togglePopupField = togglePopupField;
window.deletePopupField = deletePopupField;
window.addPopupField = addPopupField;
window.saveAndRefreshPopups = saveAndRefreshPopups;
window.renderMarkerPopupHtml = renderMarkerPopupHtml;
window.loadPopupConfig = loadPopupConfig;
window.savePopupConfig = savePopupConfig;
