// ==== Dashboard Panel - 看板统计模块 ==== //
// 右下角隐藏按钮，右上角展开面板，显示图层/类型/样式统计

// ==== DashboardPanel 类 ==== //
class DashboardPanel {
    constructor() {
        this.isOpen = false;
        this._bindEvents();
    }

    _bindEvents() {
        // 打开按钮
        const openBtn = document.getElementById('openDashboardBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => this.open());
        }

        // 关闭按钮
        const closeBtn = document.getElementById('closeDashboardBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
    }

    open() {
        const panel = document.getElementById('dashboardPanel');
        const btn = document.getElementById('openDashboardBtn');

        if (panel) {
            panel.classList.add('open');
            this.isOpen = true;
            this.update();
        }
        if (btn) {
            btn.style.display = 'none';
        }
    }

    close() {
        const panel = document.getElementById('dashboardPanel');
        const btn = document.getElementById('openDashboardBtn');

        if (panel) {
            panel.classList.remove('open');
            this.isOpen = false;
        }
        if (btn) {
            btn.style.display = 'flex';
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    // === 统计更新 === //
    update() {
        if (!this.isOpen) return;

        const container = document.getElementById('dashboardContent');
        if (!container) return;

        // 收集统计数据
        const stats = this._collectStats();

        // 渲染 HTML
        container.innerHTML = this._renderStats(stats);
    }

    _collectStats() {
        const stats = {
            currentSnapshot: null,
            totalLayers: 0,
            visibleLayers: 0,
            totalMarkers: 0,
            layers: []
        };

        // 获取当前快照信息
        if (typeof timelineManager !== 'undefined' && timelineManager) {
            const snapshot = timelineManager.getCurrentSnapshot();
            if (snapshot) {
                stats.currentSnapshot = {
                    name: snapshot.name,
                    timestamp: snapshot.timestamp
                };
            }
        }

        // 收集所有标记
        const allMarkers = [];
        const processedMarkers = new Set();

        // 从 drawnItems 收集
        if (typeof drawnItems !== 'undefined') {
            drawnItems.eachLayer(layer => {
                if (layer instanceof L.Marker && !layer._isGroupMarker) {
                    if (!processedMarkers.has(layer)) {
                        processedMarkers.add(layer);
                        allMarkers.push(layer);
                    }
                }
            });
        }

        // 从 MarkerGroupManager 收集
        if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
            markerGroupManager.groups.forEach(group => {
                group.markers.forEach(marker => {
                    if (!processedMarkers.has(marker)) {
                        processedMarkers.add(marker);
                        allMarkers.push(marker);
                    }
                });
            });
        }

        stats.totalMarkers = allMarkers.length;

        // 按类型和样式分组统计
        const typeStyleMap = new Map();  // key: "类型|颜色|symbol" -> { count, type, color, symbol }

        allMarkers.forEach(marker => {
            const props = marker.feature?.properties || {};

            // 类型字段优先级：类型 → type → category
            const type = props.类型 || props.type || props.category || '未分类';
            const color = props['marker-color'] || '#4a90e2';
            const symbol = props['marker-symbol'] || 'default';

            const key = `${type}|${color}|${symbol}`;

            if (!typeStyleMap.has(key)) {
                typeStyleMap.set(key, {
                    type: type,
                    color: color,
                    symbol: symbol,
                    count: 0
                });
            }
            typeStyleMap.get(key).count++;
        });

        // 转换为数组并按数量排序
        const typeStats = Array.from(typeStyleMap.values())
            .sort((a, b) => b.count - a.count);

        // 主图层统计
        stats.layers.push({
            layerId: 'main',
            layerName: '主图层',
            visible: true,
            markerCount: allMarkers.length,
            typeStats: typeStats
        });

        stats.totalLayers = 1;
        stats.visibleLayers = 1;

        return stats;
    }

    _renderStats(stats) {
        let html = '';

        // 概览区域
        html += `
            <div class="dashboard-overview">
                <div class="overview-item">
                    <span class="overview-icon">📅</span>
                    <span class="overview-label">当前时间点</span>
                    <span class="overview-value">${stats.currentSnapshot ? stats.currentSnapshot.name : '未保存状态'}</span>
                </div>
                <div class="overview-item">
                    <span class="overview-icon">📍</span>
                    <span class="overview-label">总标记数</span>
                    <span class="overview-value">${stats.totalMarkers}</span>
                </div>
            </div>
        `;

        // 图层统计
        stats.layers.forEach(layer => {
            html += `
                <div class="dashboard-layer">
                    <div class="layer-header">
                        <span class="layer-name">${layer.layerName}</span>
                        <span class="layer-status ${layer.visible ? 'visible' : 'hidden'}">
                            ${layer.visible ? '显示中' : '已隐藏'}
                        </span>
                        <span class="layer-count">${layer.markerCount} 个</span>
                    </div>
                    <div class="layer-breakdown">
                        ${this._renderTypeStats(layer.typeStats)}
                    </div>
                </div>
            `;
        });

        if (stats.totalMarkers === 0) {
            html += '<div class="dashboard-empty">暂无标记数据</div>';
        }

        return html;
    }

    _renderTypeStats(typeStats) {
        if (!typeStats || typeStats.length === 0) {
            return '<div class="type-empty">暂无分类数据</div>';
        }

        let html = '';
        typeStats.forEach(stat => {
            const iconClass = this._getIconClass(stat.symbol);

            html += `
                <div class="type-stat-item" data-type="${stat.type}" data-color="${stat.color}">
                    <div class="stat-preview">
                        <span class="color-dot" style="background-color: ${stat.color}"></span>
                        <span class="symbol-icon"><i class="${iconClass}"></i></span>
                    </div>
                    <span class="stat-type">${stat.type}</span>
                    <span class="stat-count">${stat.count}</span>
                </div>
            `;
        });

        return html;
    }

    _getIconClass(symbol) {
        // 从 MARKER_ICONS 获取图标类名
        if (typeof MARKER_ICONS !== 'undefined' && MARKER_ICONS[symbol]) {
            return MARKER_ICONS[symbol].class;
        }
        return 'fa-solid fa-location-dot';
    }
}

// 全局更新函数
function updateDashboard() {
    if (typeof dashboardPanel !== 'undefined' && dashboardPanel) {
        dashboardPanel.update();
    }
}

// 全局暴露
window.DashboardPanel = DashboardPanel;
window.updateDashboard = updateDashboard;

// 初始化
let dashboardPanel = null;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        dashboardPanel = new DashboardPanel();
        window.dashboardPanel = dashboardPanel;
        console.log('DashboardPanel initialized');
    }, 700);
});

console.log('Dashboard Panel module loaded');
