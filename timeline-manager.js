// ==== Timeline Manager - 时间轴快照管理模块 ==== //
// 支持保存/加载不同时间点的地图状态（图层、样式、视图）

const SNAPSHOTS_STORAGE_KEY = 'geomap_snapshots';

// ==== Snapshot 数据结构 ==== //
class Snapshot {
    constructor(name, timestamp = null) {
        this.snapshotId = `snap_${Date.now()}`;
        this.timestamp = timestamp || new Date().toISOString();
        this.name = name;
        this.layers = [];
        this.customGroups = {};
        this.viewState = null;
    }

    // 从当前地图状态创建快照
    static createFromCurrentState(name) {
        const snapshot = new Snapshot(name);

        // 保存视图状态
        if (typeof map !== 'undefined') {
            const center = map.getCenter();
            snapshot.viewState = {
                center: [center.lat, center.lng],
                zoom: map.getZoom()
            };
        }

        // 收集所有图层数据（包括样式信息）
        snapshot.layers = snapshot._collectLayerData();

        // 保存自定义组
        if (typeof customGroupManager !== 'undefined' && customGroupManager) {
            const groups = {};
            customGroupManager.groups.forEach((group, groupId) => {
                groups[groupId] = group.toJSON();
            });
            snapshot.customGroups = groups;
        }

        return snapshot;
    }

    _collectLayerData() {
        const layers = [];
        const processedMarkers = new Set();

        // 收集标记数据
        const features = [];

        // 从 drawnItems 收集
        if (typeof drawnItems !== 'undefined') {
            drawnItems.eachLayer(layer => {
                if (layer._isGroupMarker) return;
                if (processedMarkers.has(layer)) return;
                processedMarkers.add(layer);

                const feature = this._layerToGeoJSON(layer);
                if (feature) features.push(feature);
            });
        }

        // 从 MarkerGroupManager 收集（包括收起状态的）
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.groups.forEach(group => {
                group.markers.forEach(marker => {
                    if (processedMarkers.has(marker)) return;
                    processedMarkers.add(marker);

                    const feature = this._layerToGeoJSON(marker);
                    if (feature) features.push(feature);
                });
            });
        }

        // 创建主图层
        layers.push({
            layerId: 'main_layer',
            layerName: '主图层',
            visible: true,
            geojson: {
                type: 'FeatureCollection',
                features: features
            }
        });

        return layers;
    }

    _layerToGeoJSON(layer) {
        if (!layer) return null;

        const geoJSON = layer.toGeoJSON();

        // 确保保存所有样式属性
        if (layer.feature && layer.feature.properties) {
            geoJSON.properties = { ...layer.feature.properties };
        }

        // 对于标记，保存原始坐标
        if (layer instanceof L.Marker) {
            const props = layer.feature?.properties || {};
            if (props._originalLat !== undefined && props._originalLng !== undefined) {
                geoJSON.geometry.coordinates = [props._originalLng, props._originalLat];
            }
        }

        return geoJSON;
    }

    toJSON() {
        return {
            snapshotId: this.snapshotId,
            timestamp: this.timestamp,
            name: this.name,
            layers: this.layers,
            customGroups: this.customGroups,
            viewState: this.viewState
        };
    }

    static fromJSON(data) {
        const snapshot = new Snapshot(data.name, data.timestamp);
        snapshot.snapshotId = data.snapshotId;
        snapshot.layers = data.layers || [];
        snapshot.customGroups = data.customGroups || {};
        snapshot.viewState = data.viewState || null;
        return snapshot;
    }
}

// ==== TimelineManager 类 ==== //
class TimelineManager {
    constructor() {
        this.snapshots = new Map();  // snapshotId -> Snapshot
        this.currentSnapshotId = null;

        // 浏览模式状态
        this.isBrowseMode = false;
        this.savedEditState = null;  // 进入浏览模式前保存的编辑态

        this._loadFromStorage();
        this._renderTimelineUI();
    }

    // === 存储管理 === //
    _loadFromStorage() {
        try {
            const data = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                this.currentSnapshotId = parsed.currentSnapshotId || null;

                if (parsed.snapshots) {
                    Object.values(parsed.snapshots).forEach(snapData => {
                        const snapshot = Snapshot.fromJSON(snapData);
                        this.snapshots.set(snapshot.snapshotId, snapshot);
                    });
                }
                console.log(`Loaded ${this.snapshots.size} snapshots from storage`);
            }
        } catch (e) {
            console.error('Failed to load snapshots:', e);
        }
    }

    _saveToStorage() {
        try {
            const snapshots = {};
            this.snapshots.forEach((snapshot, id) => {
                snapshots[id] = snapshot.toJSON();
            });

            localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify({
                currentSnapshotId: this.currentSnapshotId,
                snapshots: snapshots
            }));
        } catch (e) {
            console.error('Failed to save snapshots:', e);
        }
    }

    // === 快照操作 === //
    saveSnapshot(name) {
        if (this.isBrowseMode) {
            alert('🚫 浏览模式下无法保存快照，请先退出或应用快照。');
            return null;
        }

        const snapshot = Snapshot.createFromCurrentState(name);
        this.snapshots.set(snapshot.snapshotId, snapshot);
        this.currentSnapshotId = snapshot.snapshotId;

        this._saveToStorage();
        this._renderTimelineUI();

        if (typeof showBriefMessage === 'function') {
            showBriefMessage(`✅ 已保存快照：${name}`);
        }

        // 刷新看板
        if (typeof updateDashboard === 'function') {
            updateDashboard();
        }

        console.log(`Snapshot saved: ${name} (${snapshot.snapshotId})`);
        return snapshot;
    }

    loadSnapshot(snapshotId) {
        const snapshot = this.snapshots.get(snapshotId);
        if (!snapshot) {
            console.warn('Snapshot not found:', snapshotId);
            return false;
        }

        console.log(`Loading snapshot: ${snapshot.name}`);

        // ⚠️ 完全重置所有运行时状态，确保快照隔离
        this._resetRuntimeState();

        // 恢复图层数据
        snapshot.layers.forEach(layerData => {
            if (layerData.geojson && layerData.geojson.features) {
                this._importGeoJSON(layerData.geojson);
            }
        });

        // 恢复视图状态
        if (snapshot.viewState && typeof map !== 'undefined') {
            map.setView(snapshot.viewState.center, snapshot.viewState.zoom);
        }

        // 恢复自定义组
        if (typeof customGroupManager !== 'undefined' && customGroupManager && snapshot.customGroups) {
            // 重建组（注意：需要在标记加载后执行）
            setTimeout(() => {
                Object.values(snapshot.customGroups).forEach(groupData => {
                    const group = CustomGroup.fromJSON(groupData);
                    customGroupManager.groups.set(group.groupId, group);

                    group.memberIds.forEach(id => {
                        if (!customGroupManager.markerToGroups.has(id)) {
                            customGroupManager.markerToGroups.set(id, new Set());
                        }
                        customGroupManager.markerToGroups.get(id).add(group.groupId);
                    });
                });
                customGroupManager._renderGroupList();
            }, 100);
        }

        this.currentSnapshotId = snapshotId;
        this._saveToStorage();
        this._renderTimelineUI();

        // 刷新所有视图
        this._refreshAllViews();

        if (typeof showBriefMessage === 'function') {
            showBriefMessage(`✅ 已加载快照：${snapshot.name}`);
        }

        return true;
    }

    // ⚠️ 完全重置所有运行时状态（快照加载前必须调用）
    _resetRuntimeState() {
        console.log('Resetting all runtime state...');

        // 1. 清空 MarkerGroupManager（必须在 drawnItems 之前）
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.clear();
            // 清空内部索引
            if (markerGroupManager.coordIndex) {
                markerGroupManager.coordIndex.clear();
            }
            if (markerGroupManager.markerToGroup) {
                markerGroupManager.markerToGroup.clear();
            }
        }

        // 2. 清空 drawnItems
        if (typeof drawnItems !== 'undefined') {
            drawnItems.clearLayers();
        }

        // 3. 清空自定义组
        if (typeof customGroupManager !== 'undefined' && customGroupManager) {
            customGroupManager.groups.clear();
            customGroupManager.markerToGroups.clear();
            customGroupManager._renderGroupList();
        }

        // 4. 清空 SelectionManager 状态
        if (typeof selectionManager !== 'undefined' && selectionManager) {
            selectionManager.deselect();
        }

        // 5. 清空表格数据
        if (typeof featureTable !== 'undefined' && featureTable) {
            featureTable.clearData();
        }

        // 6. 重置统计缓存
        if (typeof updateLayerStats === 'function') {
            updateLayerStats();
        }

        // 7. 更新图层详情面板
        if (typeof updateLayerDetailsPanel === 'function') {
            updateLayerDetailsPanel(null);
        }

        console.log('Runtime state reset complete');
    }

    _importGeoJSON(geojson) {
        if (!geojson || !geojson.features) return;

        L.geoJSON(geojson, {
            pointToLayer: (feature, latlng) => {
                const props = feature.properties || {};
                const color = props['marker-color'] || '#4a90e2';
                const symbol = props['marker-symbol'] || 'default';

                const icon = typeof createCustomMarkerIcon === 'function'
                    ? createCustomMarkerIcon(color, symbol)
                    : L.divIcon({ className: 'custom-marker-icon' });

                const marker = L.marker(latlng, { icon });
                marker.feature = { properties: { ...props } };

                if (typeof bindMarkerPopup === 'function') {
                    bindMarkerPopup(marker);
                }
                if (typeof bindMarkerContextMenu === 'function') {
                    bindMarkerContextMenu(marker);
                }

                return marker;
            },
            style: feature => {
                const style = {};
                const props = feature.properties || {};
                if (props.stroke) style.color = props.stroke;
                if (props['stroke-width']) style.weight = props['stroke-width'];
                if (props.fill) style.fillColor = props.fill;
                if (props['fill-opacity']) style.fillOpacity = props['fill-opacity'];
                return style;
            },
            onEachFeature: (feature, layer) => {
                if (layer instanceof L.Marker) {
                    if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
                        markerGroupManager.addMarker(layer);
                    } else {
                        drawnItems.addLayer(layer);
                    }
                } else {
                    drawnItems.addLayer(layer);
                }
            }
        });
    }

    _refreshAllViews() {
        // 刷新图层列表
        if (typeof updateLayerList === 'function') {
            updateLayerList();
        }

        // 刷新表格
        if (typeof updateFeatureTable === 'function') {
            updateFeatureTable();
        }

        // 刷新看板
        if (typeof updateDashboard === 'function') {
            updateDashboard();
        }

        // 刷新统计
        if (typeof updateLayerStats === 'function') {
            updateLayerStats();
        }
    }

    deleteSnapshot(snapshotId) {
        if (!this.snapshots.has(snapshotId)) return false;

        const snapshot = this.snapshots.get(snapshotId);
        this.snapshots.delete(snapshotId);

        if (this.currentSnapshotId === snapshotId) {
            this.currentSnapshotId = null;
        }

        this._saveToStorage();
        this._renderTimelineUI();

        if (typeof showBriefMessage === 'function') {
            showBriefMessage(`🗑️ 已删除快照：${snapshot.name}`);
        }

        return true;
    }

    duplicateSnapshot(snapshotId) {
        const source = this.snapshots.get(snapshotId);
        if (!source) return false;

        const newName = `${source.name} (副本)`;
        const newSnapshot = new Snapshot(newName);
        // Snapshot constructor automatically generates new ID

        // Deep copy data
        if (source.layers) {
            newSnapshot.layers = JSON.parse(JSON.stringify(source.layers));
        }
        if (source.customGroups) {
            newSnapshot.customGroups = JSON.parse(JSON.stringify(source.customGroups));
        }
        if (source.viewState) {
            newSnapshot.viewState = { ...source.viewState };
        }

        this.snapshots.set(newSnapshot.snapshotId, newSnapshot);
        this._saveToStorage();
        this._renderTimelineUI();

        if (typeof showBriefMessage === 'function') {
            showBriefMessage(`✅ 已创建副本：${newName}`);
        }

        return true;
    }

    renameSnapshot(snapshotId, newName) {
        const snapshot = this.snapshots.get(snapshotId);
        if (!snapshot) return false;

        snapshot.name = newName;
        this._saveToStorage();
        this._renderTimelineUI();

        return true;
    }

    // === 获取当前快照信息 === //
    getCurrentSnapshot() {
        if (!this.currentSnapshotId) return null;
        return this.snapshots.get(this.currentSnapshotId) || null;
    }

    getCurrentSnapshotName() {
        const snapshot = this.getCurrentSnapshot();
        return snapshot ? snapshot.name : '未保存状态';
    }

    // === UI 渲染 === //
    _renderTimelineUI() {
        const container = document.getElementById('timelineList');
        if (!container) return;

        if (this.snapshots.size === 0) {
            container.innerHTML = '<div class="timeline-empty">暂无时间点，点击上方保存当前状态</div>';
            return;
        }

        // 按时间排序
        const sorted = Array.from(this.snapshots.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        let html = '';

        // 浏览模式下添加提示
        if (this.isBrowseMode) {
            html += '<div class="browse-mode-hint">📖 浏览模式：点击快照切换查看</div>';
        }

        sorted.forEach(snapshot => {
            const isCurrent = snapshot.snapshotId === this.currentSnapshotId;
            const date = new Date(snapshot.timestamp);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

            // 计算标记数量
            let featureCount = 0;
            if (snapshot.layers && snapshot.layers[0] && snapshot.layers[0].geojson) {
                featureCount = snapshot.layers[0].geojson.features?.length || 0;
            }

            html += `
                <div class="timeline-item ${isCurrent ? 'active' : ''} ${this.isBrowseMode ? 'browse-mode' : ''}" data-snapshot-id="${snapshot.snapshotId}">
                    <div class="timeline-marker">${isCurrent ? '●' : '○'}</div>
                    <div class="timeline-content" onclick="timelineManager.onSnapshotClick('${snapshot.snapshotId}')">
                        <div class="timeline-name">${snapshot.name}</div>
                        <div class="timeline-meta">
                            <span class="timeline-date">${dateStr}</span>
                            <span class="timeline-count">${featureCount} 个标记</span>
                        </div>
                    </div>
                    <div class="timeline-actions">
                        <button onclick="event.stopPropagation(); timelineManager.renameSnapshotPrompt('${snapshot.snapshotId}')" title="重命名">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button onclick="event.stopPropagation(); timelineManager.duplicateSnapshot('${snapshot.snapshotId}')" title="创建副本">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button onclick="event.stopPropagation(); timelineManager.deleteSnapshot('${snapshot.snapshotId}')" title="删除" class="delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // 浏览模式下更新状态条
        if (this.isBrowseMode) {
            this._renderBrowseModeBar();
        }
    }

    // 快照点击处理
    onSnapshotClick(snapshotId) {
        if (this.isBrowseMode) {
            // 浏览模式：直接加载
            this.loadSnapshot(snapshotId);
        } else {
            // 编辑模式：提示进入浏览模式
            if (confirm('要加载此快照吗？\n\n• 点击「确定」进入浏览模式查看\n• 点击「取消」保持当前编辑')) {
                this.enterBrowseMode();
                this.loadSnapshot(snapshotId);
            }
        }
    }

    renameSnapshotPrompt(snapshotId) {
        const snapshot = this.snapshots.get(snapshotId);
        if (!snapshot) return;

        const newName = prompt('输入新的时间点名称：', snapshot.name);
        if (newName && newName.trim()) {
            this.renameSnapshot(snapshotId, newName.trim());
        }
    }

    saveSnapshotPrompt() {
        const name = prompt('输入时间点名称：', `快照 ${this.snapshots.size + 1}`);
        if (name && name.trim()) {
            this.saveSnapshot(name.trim());
        }
    }

    // === 获取统计 === //
    getStats() {
        return {
            totalSnapshots: this.snapshots.size,
            currentSnapshotId: this.currentSnapshotId,
            currentSnapshotName: this.getCurrentSnapshotName(),
            isBrowseMode: this.isBrowseMode
        };
    }

    // === 浏览模式 === //

    // 进入浏览模式
    enterBrowseMode() {
        if (this.isBrowseMode) {
            console.log('Already in browse mode');
            return;
        }

        if (this.snapshots.size === 0) {
            if (typeof showBriefMessage === 'function') {
                showBriefMessage('⚠️ 暂无快照可浏览');
            }
            return;
        }

        console.log('Entering browse mode...');

        // 仅在首次进入时保存编辑态（使用深拷贝确保数据隔离）
        if (!this.savedEditState) {
            const snapshot = Snapshot.createFromCurrentState('_edit_backup_');
            // 深拷贝确保数据隔离，避免引用共享导致的串数据问题
            this.savedEditState = JSON.parse(JSON.stringify(snapshot.toJSON()));
            console.log('Edit state saved (deep copy):', this.savedEditState);
        }

        this.isBrowseMode = true;

        // 禁用编辑控件
        this._disableEditControls();

        // 更新 UI
        this._renderTimelineUI();
        this._renderBrowseModeBar();

        if (typeof showBriefMessage === 'function') {
            showBriefMessage('👁️ 已进入浏览模式，点击快照切换查看');
        }

        // 如果有当前快照，加载它
        if (this.currentSnapshotId && this.snapshots.has(this.currentSnapshotId)) {
            this.loadSnapshot(this.currentSnapshotId);
        } else {
            // 加载第一个快照
            const firstSnapshotId = this.snapshots.keys().next().value;
            if (firstSnapshotId) {
                this.loadSnapshot(firstSnapshotId);
            }
        }
    }

    // 退出浏览模式 (支持强制退出)
    exitBrowseMode(force = false) {
        if (!this.isBrowseMode && !force) {
            console.log('Not in browse mode');
            return;
        }

        console.log(`Exiting browse mode (force=${force})...`);

        // 恢复编辑态
        if (this.savedEditState) {
            console.log('Restoring edit state...');
            this._resetRuntimeState();

            try {
                this.savedEditState.layers.forEach(layerData => {
                    if (layerData.geojson && layerData.geojson.features) {
                        this._importGeoJSON(layerData.geojson);
                    }
                });

                if (this.savedEditState.viewState && typeof map !== 'undefined') {
                    map.setView(this.savedEditState.viewState.center, this.savedEditState.viewState.zoom);
                }

                // 恢复自定义组
                if (typeof customGroupManager !== 'undefined' && customGroupManager && this.savedEditState.customGroups) {
                    setTimeout(() => {
                        Object.values(this.savedEditState.customGroups).forEach(groupData => {
                            const group = CustomGroup.fromJSON(groupData);
                            customGroupManager.groups.set(group.groupId, group);
                            group.memberIds.forEach(id => {
                                if (!customGroupManager.markerToGroups.has(id)) {
                                    customGroupManager.markerToGroups.set(id, new Set());
                                }
                                customGroupManager.markerToGroups.get(id).add(group.groupId);
                            });
                        });
                        customGroupManager._renderGroupList();
                    }, 100);
                }

                this._refreshAllViews();
            } catch (e) {
                console.error('Error restoring edit state:', e);
                if (typeof showBriefMessage === 'function') {
                    showBriefMessage('⚠️ 恢复编辑态时发生错误，已重置为安全状态');
                }
            }
        } else {
            console.warn('No saved edit state found. Resetting to empty state.');
            // 即使没有保存的状态，也要清理当前快照的残留
            if (force) {
                this._resetRuntimeState();
                this._refreshAllViews();
            }
        }

        this.isBrowseMode = false;
        this.savedEditState = null;
        this.currentSnapshotId = null; // 退出后不选中任何快照

        // 启用编辑控件（这是最重要的步骤，保证不被锁定）
        this._enableEditControls();

        // 更新 UI
        this._renderTimelineUI();
        this._hideBrowseModeBar();

        if (typeof showBriefMessage === 'function') {
            showBriefMessage('✏️ 已退出浏览模式，返回编辑状态');
        }
    }

    // 应用当前浏览的快照到编辑态
    applyBrowsingSnapshot() {
        if (!this.isBrowseMode || !this.currentSnapshotId) {
            return;
        }

        const snapshot = this.snapshots.get(this.currentSnapshotId);
        if (!snapshot) return;

        if (confirm(`确定要将快照「${snapshot.name}」应用到当前编辑态吗？\n\n这将覆盖之前的编辑内容！`)) {
            console.log('Applying browsing snapshot to edit state...');

            // 清空保存的编辑态
            this.savedEditState = null;

            // 退出浏览模式但保留当前数据
            this.isBrowseMode = false;
            this._enableEditControls();
            this._renderTimelineUI();
            this._hideBrowseModeBar();

            if (typeof showBriefMessage === 'function') {
                showBriefMessage(`✅ 已应用快照「${snapshot.name}」`);
            }
        }
    }

    // 渲染浏览模式状态条（居中悬浮，紧凑设计）
    _renderBrowseModeBar() {
        let bar = document.getElementById('browseModeBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'browseModeBar';
            bar.className = 'browse-mode-bar';
            document.body.insertBefore(bar, document.body.firstChild);
        }

        const currentSnapshot = this.getCurrentSnapshot();
        const snapshotName = currentSnapshot ? currentSnapshot.name : '未选择';

        // 紧凑布局：退出按钮 | 标签 | 快照名 | 应用按钮
        bar.innerHTML = `
            <button onclick="timelineManager.exitBrowseMode(true)" class="exit" title="退出浏览模式">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <span class="browse-mode-label">👁️ 只读浏览</span>
            <span class="browse-mode-snapshot">${snapshotName}</span>
            <button onclick="timelineManager.applyBrowsingSnapshot()" class="apply" title="应用到编辑态">
                <i class="fa-solid fa-check"></i> 应用
            </button>
        `;
        bar.style.display = 'flex';
    }

    _hideBrowseModeBar() {
        const bar = document.getElementById('browseModeBar');
        if (bar) {
            bar.style.display = 'none';
        }
    }

    _disableEditControls() {
        console.log('Disabling edit controls for browse mode...');

        // 1. 禁用绘制控制工具栏
        const drawControl = document.querySelector('.leaflet-draw');
        if (drawControl) {
            drawControl.style.opacity = '0.3';
            drawControl.style.pointerEvents = 'none';
        }

        // 2. 禁用导入/清空按钮
        const clearBtn = document.getElementById('clearAllBtn');
        if (clearBtn) clearBtn.disabled = true;

        const importBtn = document.querySelector('.import-btn, #importGeoJSONBtn');
        if (importBtn) importBtn.disabled = true;

        // 3. 禁用文件输入
        const fileInputs = document.querySelectorAll('#geojsonFileInput, #excelFileInput, #coordFileInput');
        fileInputs.forEach(input => {
            if (input) input.disabled = true;
        });

        // 4. 禁用右键菜单中的编辑操作（通过 body 类）
        document.body.classList.add('browse-mode-active');

        // 5. 关闭属性编辑器抽屉
        if (typeof closePropertyDrawer === 'function') {
            closePropertyDrawer();
        }

        // 6. 清空选择状态
        if (typeof selectionManager !== 'undefined' && selectionManager) {
            if (typeof selectionManager.clear === 'function') {
                selectionManager.clear();
            } else if (typeof selectionManager.deselect === 'function') {
                selectionManager.deselect();
            }
        }

        // NOTE: 移除重复的浏览模式遮罩，仅保留顶部操作条作为唯一状态入口
        // this._showBrowseModeOverlay();
    }

    _enableEditControls() {
        console.log('Enabling edit controls after browse mode...');

        // 1. 启用绘制控制工具栏
        const drawControl = document.querySelector('.leaflet-draw');
        if (drawControl) {
            drawControl.style.opacity = '1';
            drawControl.style.pointerEvents = 'auto';
        }

        // 2. 启用按钮
        const clearBtn = document.getElementById('clearAllBtn');
        if (clearBtn) clearBtn.disabled = false;

        const importBtn = document.querySelector('.import-btn, #importGeoJSONBtn');
        if (importBtn) importBtn.disabled = false;

        // 3. 启用文件输入
        const fileInputs = document.querySelectorAll('#geojsonFileInput, #excelFileInput, #coordFileInput');
        fileInputs.forEach(input => {
            if (input) input.disabled = false;
        });

        // 4. 移除浏览模式 body 类
        document.body.classList.remove('browse-mode-active');

        // 5. 隐藏浏览模式遮罩
        this._hideBrowseModeOverlay();

        // 6. 确保地图交互正常
        if (typeof map !== 'undefined') {
            map.dragging.enable();
            map.scrollWheelZoom.enable();
            map.doubleClickZoom.enable();
        }
    }

    // 显示浏览模式地图遮罩提示
    _showBrowseModeOverlay() {
        let overlay = document.getElementById('browseModeMapOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'browseModeMapOverlay';
            overlay.className = 'browse-mode-map-overlay';
            overlay.innerHTML = `
                <div class="browse-overlay-content">
                    <i class="fa-solid fa-eye"></i>
                    <span>浏览模式 - 只读</span>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    }

    // 隐藏浏览模式地图遮罩提示
    _hideBrowseModeOverlay() {
        const overlay = document.getElementById('browseModeMapOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
}

// 全局暴露
window.Snapshot = Snapshot;
window.TimelineManager = TimelineManager;
