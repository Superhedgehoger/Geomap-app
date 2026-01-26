// ==== Custom Group Manager - 自定义组管理模块 ==== //
// 支持用户多选标记创建命名组，用于统计/筛选/导出

const CUSTOM_GROUPS_STORAGE_KEY = 'geomap_custom_groups';

// ==== CustomGroup 类 ==== //
class CustomGroup {
    constructor(groupId, groupName, color = '#ff6b6b') {
        this.groupId = groupId;
        this.groupName = groupName;
        this.memberIds = [];  // Leaflet stamp IDs
        this.color = color;
        this.rule = null;     // 预留自动规则
        this.created = new Date().toISOString();
        this.expanded = false;
    }

    addMember(leafletId) {
        if (!this.memberIds.includes(leafletId)) {
            this.memberIds.push(leafletId);
        }
    }

    removeMember(leafletId) {
        const idx = this.memberIds.indexOf(leafletId);
        if (idx > -1) {
            this.memberIds.splice(idx, 1);
        }
    }

    hasMember(leafletId) {
        return this.memberIds.includes(leafletId);
    }

    getCount() {
        return this.memberIds.length;
    }

    toJSON() {
        return {
            groupId: this.groupId,
            groupName: this.groupName,
            memberIds: this.memberIds,
            color: this.color,
            rule: this.rule,
            created: this.created
        };
    }

    static fromJSON(data) {
        const group = new CustomGroup(data.groupId, data.groupName, data.color);
        group.memberIds = data.memberIds || [];
        group.rule = data.rule || null;
        group.created = data.created || new Date().toISOString();
        return group;
    }
}

// ==== CustomGroupManager 类 ==== //
class CustomGroupManager {
    constructor() {
        this.groups = new Map();        // groupId -> CustomGroup
        this.markerToGroups = new Map(); // leafletId -> Set<groupId>
        this.selectionMode = false;
        this.selectedMarkers = new Set(); // 当前选中的标记（多选模式）

        this._loadFromStorage();
        this._renderGroupList();
    }

    // === 存储管理 === //
    _loadFromStorage() {
        try {
            const data = localStorage.getItem(CUSTOM_GROUPS_STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                Object.values(parsed).forEach(groupData => {
                    const group = CustomGroup.fromJSON(groupData);
                    this.groups.set(group.groupId, group);

                    // 重建 markerToGroups 索引
                    group.memberIds.forEach(id => {
                        if (!this.markerToGroups.has(id)) {
                            this.markerToGroups.set(id, new Set());
                        }
                        this.markerToGroups.get(id).add(group.groupId);
                    });
                });
                console.log(`Loaded ${this.groups.size} custom groups from storage`);
            }
        } catch (e) {
            console.error('Failed to load custom groups:', e);
        }
    }

    _saveToStorage() {
        try {
            const data = {};
            this.groups.forEach((group, groupId) => {
                data[groupId] = group.toJSON();
            });
            localStorage.setItem(CUSTOM_GROUPS_STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save custom groups:', e);
        }
    }

    // === 多选模式 === //
    enterSelectionMode() {
        this.selectionMode = true;
        this.selectedMarkers.clear();
        document.body.classList.add('selection-mode');

        // 禁用地图 boxZoom（防止冲突）
        if (typeof map !== 'undefined' && map.boxZoom) {
            map.boxZoom.disable();
        }

        // 更新 UI
        const btn = document.getElementById('enterSelectionModeBtn');
        if (btn) {
            btn.textContent = '取消选择';
            btn.onclick = () => this.exitSelectionMode();
        }

        // 显示完成按钮
        const finishBtn = document.getElementById('finishSelectionBtn');
        if (finishBtn) finishBtn.style.display = 'block';

        // 初始化框选
        this._initBoxSelection();

        // 绑定键盘事件
        this._bindKeyboardEvents();

        // 绑定标记点击事件
        this._bindMarkerClicks();

        this._updateSelectionCount();
        console.log('Entered selection mode');

        // 创建或显示选择模式提示条
        this._showSelectionHint();

        if (typeof showBriefMessage === 'function') {
            showBriefMessage('✅ 已进入选择模式，点击标记选中');
        }
    }

    _showSelectionHint() {
        let hint = document.getElementById('selectionModeHint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'selectionModeHint';
            hint.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(74, 144, 226, 0.95);
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 15px;
                font-size: 0.9rem;
                font-weight: 500;
            `;
            document.body.appendChild(hint);
        }

        hint.innerHTML = `
            <i class="fa-solid fa-hand-pointer"></i>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: 600;">
                    <span id="selectionCountInline" style="color: #2ecc71; margin-right: 8px; display: none;"></span>
                    <span>点击选单个 | Ctrl+点击多选 | Shift+拖动框选 | ESC取消</span>
                </div>
            </div>
            <div style="margin-left: auto; display: flex; gap: 8px;">
                <button onclick="customGroupManager.exitSelectionMode()" 
                    style="padding: 6px 14px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); color: white; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">
                    <i class="fa-solid fa-times"></i> 取消
                </button>
                <button onclick="customGroupManager.finishSelectionAndCreateGroup()" 
                    style="padding: 6px 14px; background: #2ecc71; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
                    <i class="fa-solid fa-check"></i> 完成创建
                </button>
            </div>
        `;
        hint.style.display = 'flex';
    }

    _hideSelectionHint() {
        const hint = document.getElementById('selectionModeHint');
        if (hint) hint.style.display = 'none';
    }

    // === 框选功能 === //
    _initBoxSelection() {
        this._boxSelectionLayer = null;
        this._isBoxSelecting = false;
        this._boxStartLatLng = null;

        // 绑定地图鼠标事件
        this._boxStartHandler = this._onBoxStart.bind(this);
        this._boxMoveHandler = this._onBoxMove.bind(this);
        this._boxEndHandler = this._onBoxEnd.bind(this);

        map.on('mousedown', this._boxStartHandler);
        map.on('mousemove', this._boxMoveHandler);
        map.on('mouseup', this._boxEndHandler);
    }

    _onBoxStart(e) {
        // 仅在按住 Shift 且在选择模式时启动框选
        if (!this.selectionMode || !e.originalEvent.shiftKey) return;

        L.DomEvent.preventDefault(e.originalEvent);
        this._isBoxSelecting = true;
        this._boxStartLatLng = e.latlng;

        // 创建选区矩形（视觉反馈）
        this._boxSelectionLayer = L.rectangle([e.latlng, e.latlng], {
            color: '#4a90e2',
            weight: 2,
            fillColor: '#4a90e2',
            fillOpacity: 0.1,
            dashArray: '5, 5'
        }).addTo(map);
    }

    _onBoxMove(e) {
        if (!this._isBoxSelecting) return;

        // 更新矩形范围（实时显示选区）
        const bounds = L.latLngBounds(this._boxStartLatLng, e.latlng);
        this._boxSelectionLayer.setBounds(bounds);
    }

    _onBoxEnd(e) {
        if (!this._isBoxSelecting) return;

        const bounds = L.latLngBounds(this._boxStartLatLng, e.latlng);

        // 选中范围内的所有标记
        this._selectMarkersInBounds(bounds);

        // 清理选区矩形
        if (this._boxSelectionLayer) {
            map.removeLayer(this._boxSelectionLayer);
            this._boxSelectionLayer = null;
        }
        this._isBoxSelecting = false;
        this._boxStartLatLng = null;
    }

    _selectMarkersInBounds(bounds) {
        const selectMarker = (marker) => {
            if (!(marker instanceof L.Marker)) return;
            if (marker._isGroupMarker) return; // 跳过组标记

            if (bounds.contains(marker.getLatLng())) {
                if (!this.selectedMarkers.has(marker)) {
                    this.selectedMarkers.add(marker);
                    this._addSelectionHighlight(marker);
                }
            }
        };

        // 遍历所有标记容器
        if (typeof drawnItems !== 'undefined') {
            drawnItems.eachLayer(selectMarker);
        }
        if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) {
            markerClusterGroup.eachLayer(selectMarker);
        }
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.groups.forEach(group => {
                group.markers.forEach(selectMarker);
            });
        }

        this._updateSelectionCount();
    }

    _cleanupBoxSelection() {
        if (this._boxSelectionLayer) {
            map.removeLayer(this._boxSelectionLayer);
            this._boxSelectionLayer = null;
        }

        // 解绑事件
        if (this._boxStartHandler) {
            map.off('mousedown', this._boxStartHandler);
            map.off('mousemove', this._boxMoveHandler);
            map.off('mouseup', this._boxEndHandler);
        }
    }

    // === 键盘事件 === //
    _bindKeyboardEvents() {
        this._escHandler = (e) => {
            if (e.key === 'Escape' && this.selectionMode) {
                this.exitSelectionMode();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    _unbindKeyboardEvents() {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    }

    // 绑定所有标记的点击事件
    _bindMarkerClicks() {
        const self = this;

        const bindHandler = (marker) => {
            if (!(marker instanceof L.Marker)) return;

            // 保存原始点击处理器
            if (!marker._originalClickHandlers) {
                marker._originalClickHandlers = marker._events?.click?.slice() || [];
            }

            // 添加选择模式点击处理器
            marker._groupSelectionHandler = function (e) {
                if (self.selectionMode) {
                    L.DomEvent.stopPropagation(e);

                    // Ctrl/Cmd 键：切换选中（多选）
                    if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
                        self.toggleMarkerSelection(marker);
                    } else {
                        // 普通点击：清空其他，仅选当前（单选）
                        self.selectedMarkers.forEach(m => {
                            if (m !== marker) self._removeSelectionHighlight(m);
                        });
                        self.selectedMarkers.clear();
                        self.selectedMarkers.add(marker);
                        self._addSelectionHighlight(marker);
                        self._updateSelectionCount();
                    }
                }
            };
            marker.on('click', marker._groupSelectionHandler);
        };

        // 绑定 drawnItems 中的标记
        if (typeof drawnItems !== 'undefined') {
            drawnItems.eachLayer(bindHandler);
        }

        // 绑定 markerClusterGroup 中的标记
        if (typeof markerClusterGroup !== 'undefined') {
            markerClusterGroup.eachLayer(bindHandler);
        }

        // 绑定 markerGroupManager 中的标记
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.groups.forEach(group => {
                group.markers.forEach(bindHandler);
            });
        }
    }

    // 解绑标记点击事件
    _unbindMarkerClicks() {
        const unbindHandler = (marker) => {
            if (!(marker instanceof L.Marker)) return;

            // 移除选择模式处理器
            if (marker._groupSelectionHandler) {
                marker.off('click', marker._groupSelectionHandler);
                delete marker._groupSelectionHandler;
            }
        };

        if (typeof drawnItems !== 'undefined') {
            drawnItems.eachLayer(unbindHandler);
        }

        if (typeof markerClusterGroup !== 'undefined') {
            markerClusterGroup.eachLayer(unbindHandler);
        }

        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.groups.forEach(group => {
                group.markers.forEach(unbindHandler);
            });
        }
    }

    exitSelectionMode() {
        this.selectionMode = false;
        this.selectedMarkers.clear();
        document.body.classList.remove('selection-mode');

        // 恢复地图 boxZoom
        if (typeof map !== 'undefined' && map.boxZoom) {
            map.boxZoom.enable();
        }

        // 清理框选事件
        this._cleanupBoxSelection();

        // 解绑键盘事件
        this._unbindKeyboardEvents();

        // 解绑标记点击事件
        this._unbindMarkerClicks();

        // 清除所有标记的选中态
        const clearHighlights = (layer) => {
            if (layer instanceof L.Marker) {
                this._removeSelectionHighlight(layer);
            }
        };

        if (typeof drawnItems !== 'undefined') {
            drawnItems.eachLayer(clearHighlights);
        }
        if (typeof markerClusterGroup !== 'undefined') {
            markerClusterGroup.eachLayer(clearHighlights);
        }
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.groups.forEach(group => {
                group.markers.forEach(clearHighlights);
            });
        }

        // 恢复 UI
        const btn = document.getElementById('enterSelectionModeBtn');
        if (btn) {
            btn.textContent = '选择标记创建组';
            btn.onclick = () => this.enterSelectionMode();
        }

        const finishBtn = document.getElementById('finishSelectionBtn');
        if (finishBtn) finishBtn.style.display = 'none';

        const countSpan = document.getElementById('selectionCount');
        if (countSpan) countSpan.style.display = 'none';

        // 隐藏提示条
        this._hideSelectionHint();

        console.log('Exited selection mode');
    }

    toggleMarkerSelection(marker) {
        if (!this.selectionMode) return;

        const leafletId = L.stamp(marker);

        if (this.selectedMarkers.has(marker)) {
            this.selectedMarkers.delete(marker);
            this._removeSelectionHighlight(marker);
        } else {
            this.selectedMarkers.add(marker);
            this._addSelectionHighlight(marker);
        }

        this._updateSelectionCount();
    }

    _addSelectionHighlight(marker) {
        const icon = marker.getIcon();
        if (icon && icon.options && icon.options.html) {
            if (!marker._originalIconHtml) {
                marker._originalIconHtml = icon.options.html;
            }
            const highlightedHtml = icon.options.html.replace(
                'class="marker-pin',
                'class="marker-pin selection-highlight'
            );
            marker.setIcon(L.divIcon({
                ...icon.options,
                html: highlightedHtml
            }));
        }
    }

    _removeSelectionHighlight(marker) {
        if (marker._originalIconHtml) {
            const icon = marker.getIcon();
            marker.setIcon(L.divIcon({
                ...icon.options,
                html: marker._originalIconHtml
            }));
            delete marker._originalIconHtml;
        }
    }

    _updateSelectionCount() {
        const count = this.selectedMarkers.size;
        const countText = `已选 ${count}`;

        const countSpan = document.getElementById('selectionCount');
        if (countSpan) {
            countSpan.textContent = countText;
            countSpan.style.display = count > 0 ? 'block' : 'none';
        }

        // 更新提示条中的计数
        const inlineCount = document.getElementById('selectionCountInline');
        if (inlineCount) {
            inlineCount.textContent = count > 0 ? countText : '';
            inlineCount.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    // === 组 CRUD === //
    createGroup(groupName) {
        if (this.selectedMarkers.size === 0) {
            alert('请先选择至少一个标记');
            return null;
        }

        const groupId = `grp_${Date.now()}`;
        const group = new CustomGroup(groupId, groupName);

        // 添加选中的标记
        this.selectedMarkers.forEach(marker => {
            const leafletId = L.stamp(marker);
            group.addMember(leafletId);

            // 更新标记属性
            if (!marker.feature) marker.feature = { properties: {} };
            if (!marker.feature.properties._customGroups) {
                marker.feature.properties._customGroups = [];
            }
            if (!marker.feature.properties._customGroups.includes(groupId)) {
                marker.feature.properties._customGroups.push(groupId);
            }

            // 更新索引
            if (!this.markerToGroups.has(leafletId)) {
                this.markerToGroups.set(leafletId, new Set());
            }
            this.markerToGroups.get(leafletId).add(groupId);
        });

        this.groups.set(groupId, group);
        this._saveToStorage();
        this._renderGroupList();
        this.exitSelectionMode();

        // 刷新统计
        if (typeof updateLayerStats === 'function') {
            updateLayerStats();
        }

        console.log(`Created group "${groupName}" with ${group.getCount()} members`);
        return group;
    }

    // 完成选择并创建组（带提示）
    finishSelectionAndCreateGroup() {
        if (this.selectedMarkers.size === 0) {
            alert('请先选择至少一个标记');
            return;
        }

        const groupName = prompt(`请输入组名称（已选择 ${this.selectedMarkers.size} 个标记）：`, `自定义组 ${this.groups.size + 1}`);
        if (groupName && groupName.trim()) {
            this.createGroup(groupName.trim());
            if (typeof showBriefMessage === 'function') {
                showBriefMessage(`✅ 已创建组：${groupName}`);
            }
        }
    }

    deleteGroup(groupId) {
        const group = this.groups.get(groupId);
        if (!group) return;

        // 从标记属性中移除组引用
        group.memberIds.forEach(leafletId => {
            const groupSet = this.markerToGroups.get(leafletId);
            if (groupSet) {
                groupSet.delete(groupId);
                if (groupSet.size === 0) {
                    this.markerToGroups.delete(leafletId);
                }
            }

            // 更新标记属性
            if (typeof drawnItems !== 'undefined') {
                drawnItems.eachLayer(layer => {
                    if (L.stamp(layer) === leafletId && layer.feature?.properties?._customGroups) {
                        const idx = layer.feature.properties._customGroups.indexOf(groupId);
                        if (idx > -1) {
                            layer.feature.properties._customGroups.splice(idx, 1);
                        }
                    }
                });
            }
        });

        this.groups.delete(groupId);
        this._saveToStorage();
        this._renderGroupList();

        // 刷新统计
        if (typeof updateLayerStats === 'function') {
            updateLayerStats();
        }

        console.log(`Deleted group "${group.groupName}"`);
    }

    renameGroup(groupId, newName) {
        const group = this.groups.get(groupId);
        if (group) {
            group.groupName = newName;
            this._saveToStorage();
            this._renderGroupList();
        }
    }

    // === 组操作 === //
    getGroupsForMarker(marker) {
        const leafletId = L.stamp(marker);
        const groupIds = this.markerToGroups.get(leafletId);
        if (!groupIds) return [];

        return Array.from(groupIds).map(id => this.groups.get(id)).filter(Boolean);
    }

    focusOnGroup(groupId) {
        const group = this.groups.get(groupId);
        if (!group || group.getCount() === 0) return;

        // 收集组内标记
        const markers = [];
        if (typeof drawnItems !== 'undefined') {
            drawnItems.eachLayer(layer => {
                if (group.hasMember(L.stamp(layer))) {
                    markers.push(layer);
                }
            });
        }

        // 也检查 markerGroupManager 中的标记
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.groups.forEach(coordGroup => {
                coordGroup.markers.forEach(marker => {
                    if (group.hasMember(L.stamp(marker)) && !markers.includes(marker)) {
                        markers.push(marker);
                    }
                });
            });
        }

        if (markers.length === 0) return;

        // 创建 bounds
        const bounds = L.latLngBounds();
        markers.forEach(m => {
            const latlng = m._groupOriginalLatLng || m.getLatLng();
            bounds.extend(latlng);
        });

        if (typeof map !== 'undefined') {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    // === 导出 === //
    exportGroupGeoJSON(groupId) {
        const group = this.groups.get(groupId);
        if (!group) return null;

        const features = [];

        // 收集组内标记
        if (typeof drawnItems !== 'undefined') {
            drawnItems.eachLayer(layer => {
                if (group.hasMember(L.stamp(layer))) {
                    features.push(layer.toGeoJSON());
                }
            });
        }

        // 也检查 markerGroupManager 中的标记
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.groups.forEach(coordGroup => {
                coordGroup.markers.forEach(marker => {
                    if (group.hasMember(L.stamp(marker))) {
                        const exists = features.some(f =>
                            f.geometry.coordinates[0] === marker.getLatLng().lng &&
                            f.geometry.coordinates[1] === marker.getLatLng().lat
                        );
                        if (!exists) {
                            features.push(marker.toGeoJSON());
                        }
                    }
                });
            });
        }

        return {
            type: 'FeatureCollection',
            properties: {
                groupId: group.groupId,
                groupName: group.groupName,
                exportedAt: new Date().toISOString()
            },
            features: features
        };
    }

    downloadGroupGeoJSON(groupId) {
        const group = this.groups.get(groupId);
        if (!group) return;

        const geojson = this.exportGroupGeoJSON(groupId);
        if (!geojson) return;

        const data = JSON.stringify(geojson, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${group.groupName}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // === UI 渲染 === //
    _renderGroupList() {
        const container = document.getElementById('customGroupList');
        if (!container) return;

        if (this.groups.size === 0) {
            container.innerHTML = '<div class="empty-groups">暂无自定义组</div>';
            return;
        }

        let html = '';
        this.groups.forEach((group, groupId) => {
            html += `
                <div class="custom-group-item" data-group-id="${groupId}">
                    <div class="group-info" onclick="customGroupManager.focusOnGroup('${groupId}')">
                        <span class="group-color" style="background:${group.color}"></span>
                        <span class="group-name">${group.groupName}</span>
                        <span class="group-count">${group.getCount()}</span>
                    </div>
                    <div class="group-actions">
                        <button onclick="customGroupManager.downloadGroupGeoJSON('${groupId}')" title="导出该组">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        <button onclick="customGroupManager.renameGroupPrompt('${groupId}')" title="重命名">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button onclick="customGroupManager.deleteGroup('${groupId}')" title="删除" class="delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    renameGroupPrompt(groupId) {
        const group = this.groups.get(groupId);
        if (!group) return;

        const newName = prompt('输入新的组名：', group.groupName);
        if (newName && newName.trim()) {
            this.renameGroup(groupId, newName.trim());
        }
    }

    // === 获取统计 === //
    getStats() {
        return {
            totalGroups: this.groups.size,
            groups: Array.from(this.groups.values()).map(g => ({
                groupId: g.groupId,
                groupName: g.groupName,
                memberCount: g.getCount(),
                color: g.color
            }))
        };
    }

    // === 完成选择并创建组 === //
    finishSelectionAndCreateGroup() {
        if (this.selectedMarkers.size === 0) {
            alert('请先选择至少一个标记');
            return;
        }

        const groupName = prompt('请输入组名：');
        if (groupName && groupName.trim()) {
            this.createGroup(groupName.trim());
        }
    }
}

// 全局暴露
window.CustomGroup = CustomGroup;
window.CustomGroupManager = CustomGroupManager;

// 初始化（延迟到 DOM 加载后）
let customGroupManager = null;

document.addEventListener('DOMContentLoaded', () => {
    // 等待其他模块加载
    setTimeout(() => {
        customGroupManager = new CustomGroupManager();
        window.customGroupManager = customGroupManager;
        console.log('CustomGroupManager initialized');
    }, 500);
});

console.log('Custom Group Manager module loaded');
