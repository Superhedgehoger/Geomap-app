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

        // 清空当前地图
        if (typeof drawnItems !== 'undefined') {
            drawnItems.clearLayers();
        }
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.clear();
        }

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
            // 清空现有组
            customGroupManager.groups.clear();
            customGroupManager.markerToGroups.clear();

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
        sorted.forEach(snapshot => {
            const isCurrent = snapshot.snapshotId === this.currentSnapshotId;
            const date = new Date(snapshot.timestamp);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

            html += `
                <div class="timeline-item ${isCurrent ? 'active' : ''}" data-snapshot-id="${snapshot.snapshotId}">
                    <div class="timeline-marker">${isCurrent ? '●' : '○'}</div>
                    <div class="timeline-content" onclick="timelineManager.loadSnapshot('${snapshot.snapshotId}')">
                        <div class="timeline-name">${snapshot.name}</div>
                        <div class="timeline-date">${dateStr}</div>
                    </div>
                    <div class="timeline-actions">
                        <button onclick="timelineManager.renameSnapshotPrompt('${snapshot.snapshotId}')" title="重命名">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button onclick="timelineManager.deleteSnapshot('${snapshot.snapshotId}')" title="删除" class="delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
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
            currentSnapshotName: this.getCurrentSnapshotName()
        };
    }
}

// 全局暴露
window.Snapshot = Snapshot;
window.TimelineManager = TimelineManager;

// 初始化
let timelineManager = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        timelineManager = new TimelineManager();
        window.timelineManager = timelineManager;
        console.log('TimelineManager initialized');
    }, 600);
});

console.log('Timeline Manager module loaded');
