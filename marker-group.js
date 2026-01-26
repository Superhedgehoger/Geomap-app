// ==== Marker Group Manager - 组合标记管理模块 ==== //

// 坐标判定阈值（约 0.1 米精度）
const COORD_EPSILON = 1e-6;

// 放射展开配置
const SPIDERFY_CONFIG = {
    legWeight: 2,
    legColor: 'rgba(74, 144, 226, 0.6)',
    circleRadius: 40,           // 圆形布局半径（像素）
    spiralStartRadius: 30,      // 螺旋起始半径
    spiralIncrement: 12,        // 螺旋增量
    circleSwitchover: 8,        // 超过此数量使用螺旋布局
    animationDuration: 200      // 展开动画时长（毫秒）
};

// 生成坐标哈希键
function getCoordKey(latlng, epsilon = COORD_EPSILON) {
    const lat = Math.round(latlng.lat / epsilon) * epsilon;
    const lng = Math.round(latlng.lng / epsilon) * epsilon;
    return `${lat.toFixed(8)},${lng.toFixed(8)}`;
}

// 获取标记的原始坐标（考虑偏移）
function getOriginalCoord(marker) {
    const props = marker.feature?.properties || {};
    const latlng = marker.getLatLng();
    return L.latLng(
        props._originalLat !== undefined ? props._originalLat : latlng.lat,
        props._originalLng !== undefined ? props._originalLng : latlng.lng
    );
}

// ==== MarkerGroup 类 ==== //
class MarkerGroup {
    constructor(coordKey, centerLatLng) {
        this.coordKey = coordKey;
        this.center = centerLatLng;
        this.markers = [];
        this.groupMarker = null;
        this.isExpanded = false;
        this.spiderLegs = [];
        this.spiderfiedPositions = new Map(); // marker -> originalLatLng
    }

    getCount() {
        return this.markers.length;
    }

    addMarker(marker) {
        if (!this.markers.includes(marker)) {
            this.markers.push(marker);
            // 存储原始位置
            this.spiderfiedPositions.set(marker, marker.getLatLng());
        }
    }

    removeMarker(marker) {
        const idx = this.markers.indexOf(marker);
        if (idx > -1) {
            this.markers.splice(idx, 1);
            this.spiderfiedPositions.delete(marker);
        }
    }

    // 创建组合标记图标
    createGroupIcon() {
        const count = this.getCount();
        const color = '#4a90e2';

        return L.divIcon({
            className: 'group-marker-icon',
            html: `
                <div class="marker-pin group-marker" style="background:${color};">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <div class="group-marker-badge">${count}</div>
            `,
            iconSize: [36, 42],
            iconAnchor: [18, 42],
            popupAnchor: [0, -36]
        });
    }

    // 创建或更新组合标记
    updateGroupMarker(map, drawnItems) {
        const count = this.getCount();

        console.log(`Updating group marker: ${count} markers, expanded: ${this.isExpanded}`);

        if (count <= 1) {
            // 单个标记不需要组合，移除组合标记
            this.removeGroupMarker(map);
            if (count === 1) {
                const marker = this.markers[0];
                // 确保单个标记可见并在正确位置
                if (marker._groupOriginalLatLng) {
                    marker.setLatLng(marker._groupOriginalLatLng);
                }
                if (!map.hasLayer(marker)) {
                    map.addLayer(marker);
                }
            }
            return;
        }

        // 多标记情况：收起状态时隐藏所有子标记
        if (!this.isExpanded) {
            for (let i = 0; i < this.markers.length; i++) {
                const m = this.markers[i];
                if (map.hasLayer(m)) {
                    map.removeLayer(m);
                }
            }
        }

        // 创建或更新组合标记
        if (!this.groupMarker) {
            this.groupMarker = L.marker(this.center, {
                icon: this.createGroupIcon(),
                zIndexOffset: 1000
            });
            this.groupMarker._isGroupMarker = true;
            this.groupMarker._group = this;
        } else {
            this.groupMarker.setIcon(this.createGroupIcon());
            this.groupMarker.setLatLng(this.center);
        }

        // 收起状态时显示组合标记
        if (!this.isExpanded && !map.hasLayer(this.groupMarker)) {
            map.addLayer(this.groupMarker);
        }
    }

    removeGroupMarker(map) {
        if (this.groupMarker && map.hasLayer(this.groupMarker)) {
            map.removeLayer(this.groupMarker);
        }
        // 清除连接线
        this.clearSpiderLegs(map);
    }

    // 计算放射展开位置
    calculateSpiderfyPositions() {
        const count = this.getCount();
        const positions = [];

        if (count <= SPIDERFY_CONFIG.circleSwitchover) {
            // 圆形布局
            const angleStep = (2 * Math.PI) / count;
            for (let i = 0; i < count; i++) {
                const angle = i * angleStep - Math.PI / 2; // 从顶部开始
                positions.push({
                    angle: angle,
                    legLength: SPIDERFY_CONFIG.circleRadius
                });
            }
        } else {
            // 螺旋布局
            let angle = 0;
            let legLength = SPIDERFY_CONFIG.spiralStartRadius;
            for (let i = 0; i < count; i++) {
                positions.push({
                    angle: angle,
                    legLength: legLength
                });
                angle += (2 * Math.PI) / 8; // 每圈8个点
                legLength += SPIDERFY_CONFIG.spiralIncrement;
            }
        }

        return positions;
    }

    // 像素偏移转换为经纬度偏移
    pixelOffsetToLatLng(map, centerLatLng, pixelX, pixelY) {
        const centerPoint = map.latLngToLayerPoint(centerLatLng);
        const offsetPoint = L.point(centerPoint.x + pixelX, centerPoint.y + pixelY);
        return map.layerPointToLatLng(offsetPoint);
    }

    // 展开组合标记
    expand(map, drawnItems) {
        if (this.isExpanded || this.getCount() <= 1) return;

        console.log(`Expanding group with ${this.getCount()} markers`);
        this.isExpanded = true;

        // 隐藏组合标记
        if (this.groupMarker && map.hasLayer(this.groupMarker)) {
            map.removeLayer(this.groupMarker);
        }

        // 清除之前的连接线
        this.clearSpiderLegs(map);

        // 计算展开位置
        const spiderfyPositions = this.calculateSpiderfyPositions();

        // 使用组中心的经纬度作为展开基准
        const centerLatLng = this.center;

        // 展开每个子标记
        for (let i = 0; i < this.markers.length; i++) {
            const marker = this.markers[i];
            const pos = spiderfyPositions[i];

            if (!pos) {
                console.warn(`No position for marker ${i}`);
                continue;
            }

            const offsetX = pos.legLength * Math.cos(pos.angle);
            const offsetY = pos.legLength * Math.sin(pos.angle);

            const newLatLng = this.pixelOffsetToLatLng(map, centerLatLng, offsetX, offsetY);

            // 首次展开时存储原始位置
            if (!marker._groupOriginalLatLng) {
                marker._groupOriginalLatLng = L.latLng(
                    marker.feature?.properties?._originalLat || marker.getLatLng().lat,
                    marker.feature?.properties?._originalLng || marker.getLatLng().lng
                );
            }

            // 移动到展开位置
            marker.setLatLng(newLatLng);

            // 直接添加到地图（不通过 drawnItems，避免图层管理冲突）
            if (!map.hasLayer(marker)) {
                map.addLayer(marker);
            }

            // 绘制连接线
            const leg = L.polyline([centerLatLng, newLatLng], {
                weight: SPIDERFY_CONFIG.legWeight,
                color: SPIDERFY_CONFIG.legColor,
                className: 'spider-leg',
                interactive: false
            });
            leg.addTo(map);
            this.spiderLegs.push(leg);
        }

        console.log(`Group expanded: ${this.getCount()} markers shown`);
    }

    // 收起组合标记
    collapse(map, drawnItems) {
        if (!this.isExpanded) return;

        console.log(`Collapsing group with ${this.getCount()} markers`);
        this.isExpanded = false;

        // 清除连接线
        this.clearSpiderLegs(map);

        // 恢复子标记原始位置并从地图移除（但不删除标记本身）
        for (let i = 0; i < this.markers.length; i++) {
            const marker = this.markers[i];

            // 恢复原始位置
            if (marker._groupOriginalLatLng) {
                marker.setLatLng(marker._groupOriginalLatLng);
            }

            // 从地图移除（视觉上隐藏，但标记对象保留）
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        }

        // 重新显示组合标记
        if (this.getCount() > 1) {
            if (!this.groupMarker) {
                this.groupMarker = L.marker(this.center, {
                    icon: this.createGroupIcon(),
                    zIndexOffset: 1000
                });
                this.groupMarker._isGroupMarker = true;
                this.groupMarker._group = this;
            } else {
                this.groupMarker.setIcon(this.createGroupIcon());
            }

            if (!map.hasLayer(this.groupMarker)) {
                map.addLayer(this.groupMarker);
            }
        }

        console.log(`Group collapsed: ${this.getCount()} markers hidden`);
    }

    clearSpiderLegs(map) {
        this.spiderLegs.forEach(leg => {
            if (map.hasLayer(leg)) {
                map.removeLayer(leg);
            }
        });
        this.spiderLegs = [];
    }
}

// ==== MarkerGroupManager 类 ==== //
class MarkerGroupManager {
    constructor(map, drawnItems) {
        this.map = map;
        this.drawnItems = drawnItems;
        this.groups = new Map(); // coordKey -> MarkerGroup
        this.markerToGroup = new Map(); // marker -> MarkerGroup
        this.enabled = true;

        this._bindEvents();
    }

    _bindEvents() {
        // 点击空白处收起所有展开的组
        this.map.on('click', () => {
            this.collapseAll();
        });

        // ESC 键收起
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.collapseAll();
            }
        });
    }

    // 启用管理器
    enable() {
        if (this.enabled) return;
        this.enabled = true;
        console.log('MarkerGroupManager enabled, rescanning layers...');

        // 重新扫描 drawnItems 中的标记
        if (this.drawnItems) {
            this.drawnItems.eachLayer(layer => {
                if (layer instanceof L.Marker) {
                    this.addMarker(layer);
                }
            });
        }
    }

    // 禁用管理器
    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        console.log('MarkerGroupManager disabled, restoring markers...');

        // 恢复所有因分组而被隐藏的标记
        this.groups.forEach(group => {
            // Remove group marker
            group.removeGroupMarker(this.map);
            group.clearSpiderLegs(this.map);

            // Show all child markers
            group.markers.forEach(m => {
                if (m._groupOriginalLatLng) {
                    m.setLatLng(m._groupOriginalLatLng);
                }
                // 确保标记在地图上可见（如果它还在 drawnItems 中）
                if (!this.map.hasLayer(m) && this.drawnItems.hasLayer(m)) {
                    this.map.addLayer(m);
                }
            });
        });

        // 清空内部状态
        this.groups.clear();
        this.markerToGroup.clear();
    }

    // 添加标记到管理器
    addMarker(marker) {
        if (!this.enabled) return;

        // 防止重复添加
        if (this.markerToGroup.has(marker)) {
            console.log('Marker already in group, skipping');
            return;
        }

        const origCoord = getOriginalCoord(marker);
        const coordKey = getCoordKey(origCoord);

        let group = this.groups.get(coordKey);
        if (!group) {
            group = new MarkerGroup(coordKey, origCoord);
            this.groups.set(coordKey, group);
        }

        // 存储原始位置到标记上
        if (!marker._groupOriginalLatLng) {
            marker._groupOriginalLatLng = L.latLng(origCoord.lat, origCoord.lng);
        }

        group.addMarker(marker);
        this.markerToGroup.set(marker, group);

        // 更新组合标记显示
        group.updateGroupMarker(this.map, this.drawnItems);

        // 绑定组合标记点击事件（每次都检查）
        this._bindGroupMarkerClick(group);
    }

    // 绑定组合标记点击事件
    _bindGroupMarkerClick(group) {
        if (group.groupMarker && !group.groupMarker._bindedClick) {
            group.groupMarker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                this.toggleGroup(group);
            });
            group.groupMarker._bindedClick = true;
        }
    }

    // 移除标记
    removeMarker(marker) {
        const group = this.markerToGroup.get(marker);
        if (!group) return;

        group.removeMarker(marker);
        this.markerToGroup.delete(marker);

        if (group.getCount() === 0) {
            group.removeGroupMarker(this.map);
            this.groups.delete(group.coordKey);
        } else {
            group.updateGroupMarker(this.map, this.drawnItems);
        }
    }

    // 获取标记所属的组
    getGroupForMarker(marker) {
        return this.markerToGroup.get(marker) || null;
    }

    // 切换组的展开/收起状态
    toggleGroup(group) {
        if (group.isExpanded) {
            group.collapse(this.map, this.drawnItems);
        } else {
            // 先收起其他所有组
            this.collapseAll();
            group.expand(this.map, this.drawnItems);
        }
    }

    // 展开指定组
    expandGroup(group) {
        if (!group.isExpanded) {
            this.collapseAll();
            group.expand(this.map, this.drawnItems);
        }
    }

    // 收起所有组
    collapseAll() {
        this.groups.forEach(group => {
            if (group.isExpanded) {
                group.collapse(this.map, this.drawnItems);
            }
        });
    }

    // 刷新所有组的显示
    refresh() {
        this.groups.forEach(group => {
            group.updateGroupMarker(this.map, this.drawnItems);
        });
    }

    // 清空所有数据
    clear() {
        this.groups.forEach(group => {
            group.removeGroupMarker(this.map);
            group.clearSpiderLegs(this.map);
        });
        this.groups.clear();
        this.markerToGroup.clear();
    }

    // 根据标记展开其所属的组
    expandGroupForMarker(marker) {
        const group = this.getGroupForMarker(marker);
        if (group && !group.isExpanded) {
            this.expandGroup(group);
        }
    }

    // 获取统计信息
    getStats() {
        let totalGroups = 0;
        let totalMarkers = 0;
        let groupedMarkers = 0;

        this.groups.forEach(group => {
            totalGroups++;
            totalMarkers += group.getCount();
            if (group.getCount() > 1) {
                groupedMarkers += group.getCount();
            }
        });

        return { totalGroups, totalMarkers, groupedMarkers };
    }
}

// 全局暴露
window.COORD_EPSILON = COORD_EPSILON;
window.SPIDERFY_CONFIG = SPIDERFY_CONFIG;
window.getCoordKey = getCoordKey;
window.getOriginalCoord = getOriginalCoord;
window.MarkerGroup = MarkerGroup;
window.MarkerGroupManager = MarkerGroupManager;

console.log('Marker Group Manager module loaded');
