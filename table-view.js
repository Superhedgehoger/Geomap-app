// ==== Table View Module (Tabulator.js) ==== //
let featureTable = null;
let isTableInitialized = false;

// 初始化表格
function initFeatureTable() {
    if (isTableInitialized) return;

    featureTable = new Tabulator("#featureTable", {
        height: "100%",
        layout: "fitDataStretch",
        virtualDom: true,              // 启用虚拟滚动
        virtualDomBuffer: 300,         // 缓冲行数
        placeholder: "暂无数据，请先在地图上添加标记",
        columns: getTableColumns(),
        rowClick: onTableRowClick,
        cellEdited: onCellEdited,
        initialSort: [{ column: "_id", dir: "asc" }],
        selectable: 1,                 // 启用单行选择
    });

    isTableInitialized = true;

    // 注册 SelectionManager 监听器（从地图/图层面板选中时同步到表格）
    if (typeof selectionManager !== 'undefined') {
        selectionManager.onSelectionChange((event) => {
            if (event.current && featureTable) {
                selectTableRowByLayer(event.current);
            }
        });
    }

    console.log('Feature table initialized');
}

// 根据图层选中表格行并滚动到可见区域
function selectTableRowByLayer(layer) {
    if (!featureTable) return;

    const layerId = L.stamp(layer);
    const rows = featureTable.getRows();

    for (const row of rows) {
        const rowData = row.getData();
        if (rowData._id === layerId || rowData._layer === layer) {
            // 取消其他选择
            featureTable.deselectRow();
            // 选中该行
            row.select();
            // 滚动到该行
            row.scrollTo();
            console.log('Table row selected:', rowData.name);
            break;
        }
    }
}

// 获取列定义
function getTableColumns() {
    return [
        {
            title: "ID",
            field: "_id",
            width: 80,
            frozen: true,
            headerFilter: "input",
            headerFilterPlaceholder: "搜索ID",
        },
        {
            title: "名称",
            field: "name",
            editor: "input",
            headerFilter: "input",
            headerFilterPlaceholder: "搜索名称",
        },
        {
            title: "类型",
            field: "type",
            editor: "input",
            headerFilter: "input",
            headerFilterPlaceholder: "搜索类型",
        },
        {
            title: "地址",
            field: "address",
            editor: "input",
            minWidth: 200,
        },
        {
            title: "经度",
            field: "lng",
            formatter: (cell) => cell.getValue() ? cell.getValue().toFixed(6) : '-',
            sorter: "number",
            width: 110,
        },
        {
            title: "纬度",
            field: "lat",
            formatter: (cell) => cell.getValue() ? cell.getValue().toFixed(6) : '-',
            sorter: "number",
            width: 110,
        },
        {
            title: "原始经度",
            field: "_originalLng",
            formatter: (cell) => {
                const val = cell.getValue();
                return val !== undefined ? val.toFixed(6) : '-';
            },
            width: 110,
            visible: false,  // 默认隐藏
        },
        {
            title: "原始纬度",
            field: "_originalLat",
            formatter: (cell) => {
                const val = cell.getValue();
                return val !== undefined ? val.toFixed(6) : '-';
            },
            width: 110,
            visible: false,  // 默认隐藏
        },
        {
            title: "偏移索引",
            field: "_offsetIndex",
            width: 90,
            visible: false,  // 默认隐藏
        },
        // 定位按钮列
        {
            title: "操作",
            field: "_actions",
            width: 80,
            frozen: true,
            hozAlign: "center",
            headerSort: false,
            formatter: function (cell, formatterParams, onRendered) {
                return '<button class="table-locate-btn" title="定位到地图"><i class="fa-solid fa-location-crosshairs"></i></button>';
            },
            cellClick: function (e, cell) {
                e.stopPropagation();  // 阻止冒泡到行点击
                const rowData = cell.getRow().getData();
                locateMarkerOnMap(rowData._layer);
            }
        },
    ];
}

// 从地图提取数据（包括分组中的标记）
function getTableData() {
    const data = [];
    const processedMarkers = new Set();

    // Helper function to process a marker
    const processMarker = (layer) => {
        if (!(layer instanceof L.Marker) || layer._isGroupMarker) return;
        if (processedMarkers.has(layer)) return;
        processedMarkers.add(layer);

        const props = layer.feature?.properties || {};
        const latlng = layer.getLatLng();

        const rowData = {
            _id: L.stamp(layer),
            _layer: layer,  // 保存图层引用
            name: props.名称 || props.name || layer.options.name || '',
            type: props.类型 || props.type || '',
            address: props.地址 || props.address || '',
            lat: latlng.lat,
            lng: latlng.lng,
            _originalLat: props._originalLat,
            _originalLng: props._originalLng,
            _offsetIndex: props._offsetIndex,
        };

        // 添加自定义属性
        const customProps = getCustomProperties(props);
        Object.assign(rowData, customProps);

        data.push(rowData);
    };

    // 首先从 drawnItems 获取
    if (typeof drawnItems !== 'undefined') {
        drawnItems.eachLayer(processMarker);
    }

    // 然后从 MarkerGroupManager 获取分组中的标记
    if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
        markerGroupManager.groups.forEach(group => {
            group.markers.forEach(processMarker);
        });
    }

    return data;
}

// 提取自定义属性（排除内部技术字段）
function getCustomProperties(props) {
    // 判断是否为内部技术字段
    const isInternalField = (key) => {
        return key.startsWith('_') ||        // _originalLat, _originalLng, _offsetIndex
            key.startsWith('marker-') ||   // marker-color, marker-symbol, marker-size
            key === 'events';              // events 字段
    };

    // 已在表格基础列中显示的字段
    const basicDisplayedFields = ['name', 'type', 'address', 'lat', 'lng'];

    const custom = {};

    for (const [key, value] of Object.entries(props)) {
        // 只过滤内部字段和已显示的基础字段
        if (!isInternalField(key) && !basicDisplayedFields.includes(key)) {
            custom[key] = value;
        }
    }

    return custom;
}

// 更新表格数据与列结构
function updateFeatureTable() {
    if (!featureTable) {
        console.warn('Table not initialized');
        return;
    }

    const data = getTableData();

    // 动态提取所有唯一的自定义属性键
    const allKeys = new Set();
    data.forEach(row => {
        Object.keys(row).forEach(key => {
            if (!key.startsWith('_') &&
                !['name', 'type', 'address', 'lat', 'lng', '_layer'].includes(key)) {
                allKeys.add(key);
            }
        });
    });

    // 基础列
    const columns = getTableColumns();

    // 追加动态列
    allKeys.forEach(key => {
        columns.push({
            title: key,
            field: key,
            editor: "input",
            headerFilter: "input",
            minWidth: 100,
            sorter: "string"
        });
    });

    // 更新列定义和数据
    featureTable.setColumns(columns);
    featureTable.setData(data);

    console.log(`Table updated with ${data.length} rows and ${columns.length} columns`);
}

// 表格行点击事件（只做选中，不做定位）
function onTableRowClick(e, row) {
    const data = row.getData();
    const layer = data._layer;

    if (!layer) {
        console.warn('Layer not found for row');
        return;
    }

    // 使用 SelectionManager 统一管理选中状态
    if (typeof selectionManager !== 'undefined') {
        selectionManager.select(layer);
    }

    console.log('Table row selected:', data.name);
}

// 定位标记到地图（由定位按钮触发）
function locateMarkerOnMap(layer) {
    if (!layer) {
        console.warn('Layer not found for locate');
        return;
    }

    // 如果标记属于某个组，先展开该组
    if (typeof markerGroupManager !== 'undefined' && markerGroupManager) {
        markerGroupManager.expandGroupForMarker(layer);
    }

    // 地图定位到该标记
    const latlng = layer.getLatLng();
    if (typeof map !== 'undefined') {
        map.flyTo(latlng, Math.max(map.getZoom(), 16), {
            animate: true,
            duration: 0.5
        });
    }

    // 使用 SelectionManager 统一管理选中状态
    if (typeof selectionManager !== 'undefined') {
        selectionManager.select(layer);
    }

    // 高亮标记
    if (typeof highlightMarker === 'function') {
        highlightMarker(layer);
    }

    // 获取名称显示提示
    const props = layer.feature?.properties || {};
    const name = props.名称 || props.name || '标记';
    if (typeof showBriefMessage === 'function') {
        showBriefMessage(`📍 已定位到: ${name}`);
    }

    console.log('Marker located on map:', name);
}

// 全局暴露
window.locateMarkerOnMap = locateMarkerOnMap;

// 单元格编辑回写
function onCellEdited(cell) {
    const field = cell.getField();
    const value = cell.getValue();
    const rowData = cell.getRow().getData();
    const layer = rowData._layer;

    if (!layer || !layer.feature) {
        console.warn('Cannot update layer properties');
        return;
    }

    // 回写到 feature properties
    if (field === 'name') {
        layer.feature.properties.name = value;
        layer.options.name = value;
    } else if (field === 'type' || field === 'address') {
        layer.feature.properties[field] = value;
    } else {
        // 自定义字段
        layer.feature.properties[field] = value;
    }

    // 更新其他视图
    if (typeof updateLayerList === 'function') {
        updateLayerList();
    }
    if (typeof updateGeoJSONEditor === 'function') {
        updateGeoJSONEditor();
    }

    console.log(`Cell edited: ${field} = ${value}`);
}

// 地图标记选中同步到表格
function syncMapToTable(layer) {
    if (!featureTable) return;

    const id = layer._leaflet_id;

    // 取消所有选中
    featureTable.deselectRow();

    // 选中对应行
    const row = featureTable.getRow(id);
    if (row) {
        row.select();
        row.scrollTo();
    }
}

// 切换表格显示/隐藏
function toggleTableView() {
    const panel = document.getElementById('tableViewPanel');
    const isOpen = panel.classList.contains('open');

    if (!isOpen) {
        // 展开表格
        panel.classList.add('open');

        // 初始化（如果是第一次）
        if (!isTableInitialized) {
            initFeatureTable();
        }

        // 更新数据
        updateFeatureTable();

        // 触发地图重绘以适应新布局
        setTimeout(() => {
            if (typeof map !== 'undefined') {
                map.invalidateSize();
            }
        }, 350);
    } else {
        // 收起表格
        panel.classList.remove('open');

        // 触发地图重绘
        setTimeout(() => {
            if (typeof map !== 'undefined') {
                map.invalidateSize();
            }
        }, 350);
    }
}

// 关闭表格
function closeTableView() {
    const panel = document.getElementById('tableViewPanel');
    panel.classList.remove('open');

    // 触发地图重绘
    setTimeout(() => {
        if (typeof map !== 'undefined') {
            map.invalidateSize();
        }
    }, 350);
}

// 全局暴露函数
window.initFeatureTable = initFeatureTable;
window.updateFeatureTable = updateFeatureTable;
window.syncMapToTable = syncMapToTable;
window.toggleTableView = toggleTableView;
window.closeTableView = closeTableView;

// DOM 加载完成后绑定事件
document.addEventListener('DOMContentLoaded', () => {
    // 切换按钮
    const toggleBtn = document.getElementById('toggleTableBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleTableView);
    }

    // 关闭按钮
    const closeBtn = document.getElementById('closeTableBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTableView);
    }

    // 刷新按钮
    const refreshBtn = document.getElementById('refreshTableBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            updateFeatureTable();
            showBriefMessage('✅ 表格已刷新');
        });
    }

    // 拖拽调整高度
    initTableDragResize();

    console.log('Table view module loaded');
});

// ==== Table Drag Resize ==== //
function initTableDragResize() {
    const handle = document.getElementById('tableDragHandle');
    const panel = document.getElementById('tableViewPanel');

    if (!handle || !panel) return;

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;
    const minHeight = 200;
    const maxHeight = window.innerHeight * 0.7;

    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.clientY;
        startHeight = panel.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaY = startY - e.clientY;
        let newHeight = startHeight + deltaY;

        // 限制高度范围
        newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

        panel.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // 刷新地图尺寸
            if (typeof map !== 'undefined') {
                map.invalidateSize();
            }

            // 刷新表格
            if (featureTable) {
                featureTable.redraw();
            }
        }
    });
}

window.initTableDragResize = initTableDragResize;
