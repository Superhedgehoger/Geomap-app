// ==== Layer Statistics Module - 图层统计模块 ==== //

// 更新图层统计信息
function updateLayerStats() {
    const statsContainer = document.getElementById('layerStats');
    if (!statsContainer) return;

    // 收集所有标记（包括分组中的）
    const markers = [];
    const typeCount = {};

    // 从 drawnItems 收集
    if (typeof drawnItems !== 'undefined') {
        drawnItems.eachLayer(layer => {
            if (layer instanceof L.Marker && !layer._isGroupMarker) {
                markers.push(layer);
            }
        });
    }

    // 从 MarkerGroupManager 收集
    if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
        markerGroupManager.groups.forEach(group => {
            group.markers.forEach(marker => {
                if (!markers.includes(marker)) {
                    markers.push(marker);
                }
            });
        });
    }

    // 从 MarkerClusterGroup 收集 (点聚合模式)
    if (typeof markerClusterGroup !== 'undefined' && markerClusterGroup) {
        // cluster group might contain markers that are NOT in drawnItems?
        // Usually cluster takes layers FROM drawnItems or directly added.
        // We should iterate all recursive layers
        markerClusterGroup.eachLayer(layer => {
            if (layer instanceof L.Marker && !markers.includes(layer)) {
                markers.push(layer);
            }
        });
    }

    // 从 HiddenLayers 收集 (统计总数时包含隐藏?)
    // 用户可能希望统计 "Total" assets.
    if (typeof hiddenLayers !== 'undefined') {
        hiddenLayers.forEach(layer => {
            if (layer instanceof L.Marker && !markers.includes(layer)) {
                markers.push(layer);
            }
        });
    }

    // 统计类型分布
    markers.forEach(marker => {
        const props = marker.feature?.properties || {};
        const type = props.类型 || props.type || props.category || '未分类';
        typeCount[type] = (typeCount[type] || 0) + 1;
    });

    // 计算分组数量
    let groupCount = 0;
    if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
        markerGroupManager.groups.forEach(group => {
            if (group.getCount() > 1) {
                groupCount++;
            }
        });
    }

    // 计算自定义组数量
    let customGroupCount = 0;
    if (typeof customGroupManager !== 'undefined' && customGroupManager) {
        customGroupCount = customGroupManager.groups.size;
    }

    // 生成 HTML
    const total = markers.length;
    const typeEntries = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);

    let html = `
        <div class="stats-header">
            <span class="stats-total">${total}</span>
            <span class="stats-label">个标记</span>
            ${groupCount > 0 ? `<span class="stats-group-badge">${groupCount} 个坐标组</span>` : ''}
            ${customGroupCount > 0 ? `<span class="stats-group-badge custom">${customGroupCount} 个自定义组</span>` : ''}
        </div>
        ${hiddenLayers.size > 0 ? `<div class="stats-hidden-info" style="font-size:0.8rem; opacity:0.7; margin-top:4px;">(包含 ${hiddenLayers.size} 个隐藏标记)</div>` : ''}
    `;

    if (typeEntries.length > 0) {
        html += '<div class="stats-breakdown">';
        typeEntries.forEach(([type, count]) => {
            const percent = Math.round((count / total) * 100);
            html += `
                <div class="stats-row">
                    <span class="stats-type">${type}</span>
                    <span class="stats-bar">
                        <span class="stats-bar-fill" style="width: ${percent}%"></span>
                    </span>
                    <span class="stats-count">${count}</span>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<div class="stats-empty">暂无标记数据</div>';
    }

    statsContainer.innerHTML = html;
}

// 自动刷新统计（监听数据变化）
function initLayerStatsRefresh() {
    // 定期刷新（作为后备机制）
    setInterval(() => {
        updateLayerStats();
    }, 2000);

    // 初始刷新
    setTimeout(() => {
        updateLayerStats();
    }, 500);
}

// 全局暴露
window.updateLayerStats = updateLayerStats;
window.initLayerStatsRefresh = initLayerStatsRefresh;

console.log('Layer Stats module loaded');
