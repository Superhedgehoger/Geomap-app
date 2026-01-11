# GeoJSON 地图编辑器 - API 参考

本文档列出所有公开的全局函数和事件。

---

## 地图操作

### 图层管理

```javascript
// 更新图层列表
updateLayerList()

// 更新 GeoJSON 编辑器
updateGeoJSONEditor()

// 更新标签显示
updateLabels()

// 删除图层
deleteLayer(layerId)
```

### 导入导出

```javascript
// 导出 GeoJSON
exportGeoJSON()

// 导入 GeoJSON（字符串或对象）
importGeoJSON(raw)
```

---

## 标记操作

### 选中与高亮

```javascript
// 高亮标记（3秒自动消失）
highlightMarker(marker)

// 移除标记高亮
removeMarkerHighlight(marker)

// 绑定标记事件（右键、左键、双击）
bindMarkerContextMenu(marker)
```

### 多标记支持

```javascript
// 查找同位置的所有标记
findMarkersAtLocation(latlng, epsilon = 0.000001)

// 应用智能偏移
applySmartOffset(originalLatlng, offsetIndex)
```

---

## 属性编辑器

### 抽屉操作

```javascript
// 打开属性抽屉
openPropertyDrawer(marker)

// 关闭属性抽屉
closePropertyDrawer()

// 兼容别名
openPropertyEditor()  // -> openPropertyDrawer
closePropertyEditor() // -> closePropertyDrawer
```

### 属性操作

```javascript
// 渲染自定义属性列表
renderCustomProperties(props)

// 更新自定义属性值
updateCustomPropertyValue(key, value)

// 添加自定义属性
addCustomProperty()

// 删除自定义属性
deleteCustomProperty(key)

// 保存属性更改
savePropertyChanges()
```

### 快捷操作

```javascript
// 复制当前坐标
copyCurrentCoordinates()

// 从抽屉打开图标选择器
changeIconFromDrawer()

// 从抽屉打开事件追踪器
openEventTrackerFromDrawer()

// 从抽屉删除标记
deleteMarkerFromDrawer()
```

---

## 表格视图

```javascript
// 初始化表格
initFeatureTable()

// 更新表格数据
updateFeatureTable()

// 同步地图选中到表格
syncMapToTable(layer)

// 切换表格显示/隐藏
toggleTableView()

// 关闭表格
closeTableView()
```

---

## 事件追踪器

```javascript
// 打开事件追踪器
openEventTracker(marker)

// 从图层ID打开
openEventTrackerForLayerId(layerId)

// 关闭事件追踪器
closeEventTracker()

// 添加事件
addEvent()

// 保存事件
saveEvents()
```

---

## 图标管理

```javascript
// 打开图标选择器
openIconPicker()

// 关闭图标选择器
closeIconPicker()

// 创建自定义标记图标
createCustomMarkerIcon(color, iconType)

// 获取标记图标
getMarkerIcon(properties)
```

---

## 存档系统

```javascript
// 获取存档列表
getArchiveList()

// 创建存档
createArchive()

// 加载存档
loadArchive(id)

// 删除存档
deleteArchive(id)

// 保存当前存档
saveCurrentArchive()
```

---

## 全局变量

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `map` | L.Map | Leaflet 地图实例 |
| `drawnItems` | L.FeatureGroup | 绘制图层组 |
| `contextMenuTarget` | L.Marker | 右键菜单目标 |
| `selectedMarker` | L.Marker | 当前选中标记 |
| `currentHighlightedMarker` | L.Marker | 当前高亮标记 |
| `currentEditingMarker` | L.Marker | 正在编辑的标记 |
| `featureTable` | Tabulator | 表格实例 |

---

## 常量

```javascript
// 多标记偏移距离（约10米）
const OFFSET_DISTANCE = 0.0001;

// 标记图标配置
const MARKER_ICONS = {
    'default': { class: 'fa-solid fa-location-dot', name: '默认' },
    'gas': { class: 'fa-solid fa-gas-pump', name: '加油站' },
    'car': { class: 'fa-solid fa-car', name: '汽车' },
    // ...
};
```
