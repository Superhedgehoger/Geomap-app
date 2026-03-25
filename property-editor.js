// ==== Multi-Marker Smart Offset System ==== //
const OFFSET_DISTANCE = 0.0001; // ~10 meters at equator

// Find all markers at the same location
function findMarkersAtLocation(latlng, epsilon = 0.000001) {
    const markers = [];
    drawnItems.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            const markerLatlng = layer.getLatLng();
            // Check original coordinates if available
            const origLat = layer.feature?.properties?._originalLat || markerLatlng.lat;
            const origLng = layer.feature?.properties?._originalLng || markerLatlng.lng;

            const dist = Math.sqrt(
                Math.pow(origLat - latlng.lat, 2) +
                Math.pow(origLng - latlng.lng, 2)
            );
            if (dist < epsilon) {
                markers.push(layer);
            }
        }
    });
    return markers;
}

// Apply circular offset to marker
function applySmartOffset(originalLatlng, offsetIndex) {
    if (offsetIndex === 0) {
        return originalLatlng;
    }
    const angle = (offsetIndex * 360 / 6) * (Math.PI / 180); // 6-point circle
    const offsetLat = originalLatlng.lat + (OFFSET_DISTANCE * Math.cos(angle));
    const offsetLng = originalLatlng.lng + (OFFSET_DISTANCE * Math.sin(angle));
    return L.latLng(offsetLat, offsetLng);
}

// ==== Property Drawer System ==== //
let currentEditingMarker = null;

// Open property drawer (replaces openPropertyEditor)
function openPropertyDrawer(marker) {
    if (!marker) {
        marker = selectedMarker || contextMenuTarget;
    }

    if (!marker) {
        console.warn('No marker to edit');
        return;
    }

    if (!(marker instanceof L.Marker)) {
        showToast('属性编辑器仅支持标记');
        return;
    }

    currentEditingMarker = marker;

    // Ensure feature structure exists
    if (!marker.feature) {
        marker.feature = { type: 'Feature', properties: {}, geometry: {} };
    }
    if (!marker.feature.properties) {
        marker.feature.properties = {};
    }

    const props = marker.feature.properties;
    const latlng = marker.getLatLng();

    // Populate basic fields
    document.getElementById('propName').value = props.名称 || props.name || marker.options.name || '';
    document.getElementById('propType').value = props.类型 || props.type || '';
    document.getElementById('propAddress').value = props.地址 || props.address || '';

    // Display coordinates
    document.getElementById('propLat').textContent = latlng.lat.toFixed(6);
    document.getElementById('propLng').textContent = latlng.lng.toFixed(6);

    // Update icon preview
    updateIconPreviewInDrawer(props);

    // Render custom properties
    renderCustomProperties(props);

    // Render radius rings config
    renderRadiusRingsConfig(props);

    // Show drawer with animation
    const drawer = document.getElementById('propertyDrawer');
    drawer.style.display = 'block';
    setTimeout(() => {
        drawer.classList.add('active');
    }, 10);

    // Hide context menu if open
    hideContextMenu();
}

// Alias for compatibility
window.openPropertyEditor = openPropertyDrawer;

function closePropertyDrawer() {
    const drawer = document.getElementById('propertyDrawer');
    drawer.classList.remove('active');
    setTimeout(() => {
        drawer.style.display = 'none';
        currentEditingMarker = null;
    }, 300);
}

function updateIconPreviewInDrawer(props) {
    const previewDiv = document.getElementById('currentIconPreview');
    const color = props['marker-color'] || '#4a90e2';
    const iconSymbol = props['marker-symbol'] || 'default';

    const iconConfig = MARKER_ICONS[iconSymbol] || MARKER_ICONS['default'];
    const iconClass = iconConfig.class;

    previewDiv.innerHTML = `
        <div class="preview-marker" style="background:${color};">
            <i class="${iconClass}"></i>
        </div>
    `;
}

function renderCustomProperties(props) {
    const container = document.getElementById('customPropertyList');

    // 判断是否为内部技术字段
    const isInternalField = (key) => {
        return key.startsWith('_') ||        // _originalLat, _originalLng, _offsetIndex
            key.startsWith('marker-') ||   // marker-color, marker-symbol, marker-size
            key === 'events';              // events 字段
    };

    // 基础字段（已在专门区域显示，不重复显示在自定义属性中）
    const basicDisplayedFields = ['name', 'type', 'address'];

    // 过滤规则：只排除内部技术字段和已经在基础信息区显示的字段
    // 所有其他字段（包括中文字段）都应该显示
    const customProps = Object.entries(props).filter(([key]) =>
        !isInternalField(key) && !basicDisplayedFields.includes(key)
    );

    if (customProps.length === 0) {
        container.innerHTML = '<p style="color:#666;font-size:0.85rem;text-align:center;padding:10px 0;">暂无自定义属性</p>';
        return;
    }

    container.innerHTML = customProps.map(([key, value]) => {
        const safeKey = key.replace(/'/g, "\\'");
        const safeValue = String(value || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
            <div class="custom-prop-item">
                <span>${key}</span>
                <input type="text" value="${safeValue}" 
                       onchange="updateCustomPropertyValue('${safeKey}', this.value)" />
                <button onclick="deleteCustomProperty('${safeKey}')">删除</button>
            </div>
        `;
    }).join('');
}

function updateCustomPropertyValue(key, value) {
    if (currentEditingMarker && currentEditingMarker.feature) {
        currentEditingMarker.feature.properties[key] = value;
    }
}

function addCustomProperty() {
    if (!currentEditingMarker) return;

    const keyInput = document.getElementById('newPropKey');
    const valueInput = document.getElementById('newPropValue');
    const key = keyInput.value.trim();
    const value = valueInput.value.trim();

    if (!key) {
        keyInput.focus();
        return;
    }

    if (!currentEditingMarker.feature) {
        currentEditingMarker.feature = { type: 'Feature', properties: {}, geometry: {} };
    }
    if (!currentEditingMarker.feature.properties) {
        currentEditingMarker.feature.properties = {};
    }

    currentEditingMarker.feature.properties[key] = value;

    // Re-render
    renderCustomProperties(currentEditingMarker.feature.properties);

    // Clear inputs
    keyInput.value = '';
    valueInput.value = '';
}

function deleteCustomProperty(key) {
    if (!await showConfirm(`确定删除属性 "${key}"？`)) return;

    if (currentEditingMarker && currentEditingMarker.feature && currentEditingMarker.feature.properties) {
        delete currentEditingMarker.feature.properties[key];
        renderCustomProperties(currentEditingMarker.feature.properties);
    }
}

function savePropertyChanges() {
    if (!currentEditingMarker) return;

    if (!currentEditingMarker.feature) {
        currentEditingMarker.feature = { type: 'Feature', properties: {}, geometry: {} };
    }
    if (!currentEditingMarker.feature.properties) {
        currentEditingMarker.feature.properties = {};
    }

    const props = currentEditingMarker.feature.properties;
    const nameVal = document.getElementById('propName').value.trim();
    const typeVal = document.getElementById('propType').value.trim();
    const addrVal = document.getElementById('propAddress').value.trim();

    // 优先保存回原始存在的字段
    if (props.名称 !== undefined) props.名称 = nameVal;
    else props.name = nameVal;

    if (props.类型 !== undefined) props.类型 = typeVal;
    else props.type = typeVal;

    if (props.地址 !== undefined) props.地址 = addrVal;
    else props.address = addrVal;

    // Update marker name in options
    currentEditingMarker.options.name = nameVal || '标记';

    // Refresh Popup if it's open
    if (typeof bindMarkerPopup === 'function') {
        bindMarkerPopup(currentEditingMarker);
    }

    // Refresh UI
    updateLayerList();
    updateGeoJSONEditor();
    closePropertyDrawer();

    // Show success message briefly
    showBriefMessage('✅ 属性已保存');
}

function showBriefMessage(msg) {
    const existingMsg = document.getElementById('_briefMsg');
    if (existingMsg) existingMsg.remove();

    const div = document.createElement('div');
    div.id = '_briefMsg';
    div.textContent = msg;
    div.style.cssText = `
        position: fixed;
        top: 20px;
        right: 420px;
        background: #4a90e2;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10001;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = 'opacity 0.3s';
        setTimeout(() => div.remove(), 300);
    }, 2000);
}

// Quick action functions
function copyCurrentCoordinates() {
    if (!currentEditingMarker) return;
    const latlng = currentEditingMarker.getLatLng();
    const text = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    showBriefMessage('📋 坐标已复制');
}

function changeIconFromDrawer() {
    if (!currentEditingMarker) return;
    contextMenuTarget = currentEditingMarker;
    openIconPicker();
}

function openEventTrackerFromDrawer() {
    if (!currentEditingMarker) return;
    closePropertyDrawer();
    setTimeout(() => {
        openEventTracker(currentEditingMarker);
    }, 350);
}

function deleteMarkerFromDrawer() {
    if (!currentEditingMarker) return;
    if (!await showConfirm('确定删除此标记？')) return;

    drawnItems.removeLayer(currentEditingMarker);
    updateLayerList();
    updateGeoJSONEditor();
    closePropertyDrawer();
    showBriefMessage('🗑️ 标记已删除');
}

// Override closePropertyEditor for compatibility
window.closePropertyEditor = closePropertyDrawer;

// Make functions globally accessible
window.openPropertyDrawer = openPropertyDrawer;
window.closePropertyDrawer = closePropertyDrawer;
window.addCustomProperty = addCustomProperty;
window.deleteCustomProperty = deleteCustomProperty;
window.updateCustomPropertyValue = updateCustomPropertyValue;
window.savePropertyChanges = savePropertyChanges;
window.copyCurrentCoordinates = copyCurrentCoordinates;
window.changeIconFromDrawer = changeIconFromDrawer;
window.openEventTrackerFromDrawer = openEventTrackerFromDrawer;
window.deleteMarkerFromDrawer = deleteMarkerFromDrawer;

// ==== Radius Rings Configuration ==== //
const RADIUS_OPTIONS = [
    { value: 1500, label: '1.5km' },
    { value: 2000, label: '2km' },
    { value: 3000, label: '3km' },
    { value: 5000, label: '5km' },
    { value: 10000, label: '10km' }
];

// 虚线样式配置（不同半径使用不同虚线模式）
const RADIUS_DASH_PATTERNS = {
    1500: '5,5',
    2000: '10,5',
    3000: '15,5',
    5000: '20,5',
    10000: '25,10'
};

// 渲染范围圈配置 UI
function renderRadiusRingsConfig(props) {
    const container = document.getElementById('radiusRingsConfig');
    if (!container) return;

    const currentRings = props.radiusRings || [];

    container.innerHTML = RADIUS_OPTIONS.map(opt => {
        const isSelected = currentRings.includes(opt.value);
        return `
            <label class="radius-ring-option ${isSelected ? 'selected' : ''}">
                <input type="checkbox" 
                       value="${opt.value}" 
                       ${isSelected ? 'checked' : ''}
                       onchange="toggleRadiusRing(${opt.value})" />
                <span class="radius-label">${opt.label}</span>
            </label>
        `;
    }).join('');
}

// 切换单个半径的选中状态
function toggleRadiusRing(radius) {
    if (!currentEditingMarker) return;

    // 确保 feature 结构存在
    if (!currentEditingMarker.feature) {
        currentEditingMarker.feature = { type: 'Feature', properties: {}, geometry: {} };
    }
    if (!currentEditingMarker.feature.properties) {
        currentEditingMarker.feature.properties = {};
    }

    const props = currentEditingMarker.feature.properties;
    let rings = props.radiusRings || [];

    const index = rings.indexOf(radius);
    if (index > -1) {
        // 移除
        rings.splice(index, 1);
    } else {
        // 添加并排序
        rings.push(radius);
        rings.sort((a, b) => a - b);
    }

    props.radiusRings = rings;

    // 立即更新地图上的范围圈
    updateRadiusRingsOnMap(currentEditingMarker);

    // 更新 UI 选中状态
    renderRadiusRingsConfig(props);
}

// 更新地图上的范围圈
function updateRadiusRingsOnMap(marker) {
    if (!marker || !(marker instanceof L.Marker)) return;

    const latlng = marker.getLatLng();
    const props = marker.feature?.properties || {};
    const rings = props.radiusRings || [];

    // 清除旧的范围圈
    if (marker._radiusRings) {
        marker._radiusRings.forEach(circle => {
            if (map.hasLayer(circle)) {
                map.removeLayer(circle);
            }
        });
    }

    // 创建新的范围圈
    marker._radiusRings = rings.map(radius => {
        const dashPattern = RADIUS_DASH_PATTERNS[radius] || '10,5';
        const circle = L.circle(latlng, {
            radius: radius,  // 使用 meters 单位
            color: '#1677FF',
            weight: 2,
            opacity: 0.8,
            fillColor: '#1677FF',
            fillOpacity: 0.1,
            dashArray: dashPattern,
            interactive: false  // 不响应鼠标事件
        });

        // 如果标记未隐藏，则添加到地图
        if (!marker._hidden) {
            circle.addTo(map);
        }

        return circle;
    });
}

// 清除标记的所有范围圈
function clearRadiusRings(marker) {
    if (!marker) return;

    if (marker._radiusRings) {
        marker._radiusRings.forEach(circle => {
            if (map.hasLayer(circle)) {
                map.removeLayer(circle);
            }
        });
        marker._radiusRings = [];
    }
}

// 全局暴露函数
window.renderRadiusRingsConfig = renderRadiusRingsConfig;
window.toggleRadiusRing = toggleRadiusRing;
window.updateRadiusRingsOnMap = updateRadiusRingsOnMap;
window.clearRadiusRings = clearRadiusRings;

console.log('Property drawer system initialized');
