# GeoJSON 地图编辑器 - 开发者指南

本文档为开发者提供代码结构、扩展方法和最佳实践说明。

---

## 项目结构

```
map-app/
├── index.html              # 主页面
├── style.css               # 主样式
├── script.js               # 核心逻辑（~2750行）
├── property-editor.js      # 属性编辑器（~310行）
├── table-view.js           # 表格视图（~280行）
├── table-view-styles.css   # 表格样式
├── server.py               # 本地服务器
├── README.md               # 用户文档
├── CHANGELOG.md            # 更新日志
└── updatedocs/             # 开发文档
    ├── CHANGELOG.md        # 版本更新日志
    ├── DEVELOPER_GUIDE.md  # 开发者指南（本文档）
    └── API_REFERENCE.md    # API 参考
```

---

## 核心模块

### 1. script.js - 主逻辑

**主要功能区**：
- 地图初始化（Leaflet）
- 绘制控件（Leaflet.draw）
- 图层管理
- GeoJSON 导入/导出
- 事件追踪器
- 存档系统

**关键全局变量**：
```javascript
let map;                    // Leaflet 地图实例
let drawnItems;             // 绘制图层组
let contextMenuTarget;      // 右键菜单目标
let selectedMarker;         // 当前选中标记
let currentHighlightedMarker; // 当前高亮标记
```

### 2. property-editor.js - 属性编辑

**主要函数**：
```javascript
openPropertyDrawer(marker)   // 打开属性抽屉
closePropertyDrawer()        // 关闭抽屉
renderCustomProperties(props) // 渲染自定义属性
savePropertyChanges()        // 保存更改
```

**字段过滤逻辑**：
```javascript
// 只过滤内部技术字段
const isInternalField = (key) => {
    return key.startsWith('_') ||
           key.startsWith('marker-') ||
           key === 'events';
};
```

### 3. table-view.js - 表格视图

**主要函数**：
```javascript
initFeatureTable()     // 初始化 Tabulator
updateFeatureTable()   // 更新数据
syncMapToTable(layer)  // 同步选中状态
toggleTableView()      // 切换显示/隐藏
```

---

## 事件绑定

### 标记点击事件

```javascript
function bindMarkerContextMenu(marker) {
    // 右键：显示菜单 + 设置选中
    marker.on('contextmenu', e => {
        contextMenuTarget = marker;
        selectedMarker = marker;
        // 显示菜单...
    });

    // 左键：高亮 + 设置选中
    marker.on('click', e => {
        selectedMarker = marker;
        if (e.originalEvent.ctrlKey) {
            openPropertyDrawer(marker);
        } else {
            highlightMarker(marker);
        }
    });

    // 双击：打开事件追踪器
    marker.on('dblclick', e => {
        selectedMarker = marker;
        openEventTracker(marker);
    });
}
```

---

## 数据结构

### GeoJSON Feature Properties

```javascript
{
  // 英文基础字段
  "name": "标记名称",
  "type": "类型",
  "address": "地址",
  
  // 样式字段（内部使用）
  "marker-color": "#4a90e2",
  "marker-symbol": "default",
  
  // 多标记偏移（内部使用）
  "_originalLat": 30.266667,
  "_originalLng": 120.166667,
  "_offsetIndex": 0,
  
  // 事件数据
  "events": [...],
  
  // 中文业务字段（完整支持）
  "类型": "加油站",
  "销售等级": "A级",
  "加油笔数": "150"
}
```

### 内部字段规则

| 前缀/名称 | 用途 | 是否显示 |
|----------|------|---------|
| `_*` | 系统内部数据 | ❌ 隐藏 |
| `marker-*` | 样式控制 | ❌ 隐藏 |
| `events` | 事件数据 | ❌ 隐藏 |
| 其他 | 业务字段 | ✅ 显示 |

---

## 扩展开发

### 添加新字段

无需修改代码，新字段自动支持：
1. 在 GeoJSON 中添加新属性
2. 属性编辑器自动显示
3. 表格视图自动显示列

### 添加新功能模块

1. 创建独立 JS 文件
2. 在 index.html 末尾引入
3. 使用 `window.` 暴露全局函数
4. 在 updateLayerList() 中添加同步调用

### 样式定制

- 主题色：`#4a90e2`（蓝色）
- 背景色：`#1e1e1e`（深灰）
- 遵循现有暗色主题风格

---

## 调试技巧

### 控制台命令

```javascript
// 查看所有图层
drawnItems.eachLayer(l => console.log(l));

// 查看当前选中
console.log(selectedMarker);

// 手动打开属性编辑器
openPropertyDrawer(selectedMarker);

// 刷新表格
updateFeatureTable();
```

### 常见问题

1. **属性不显示**：检查字段是否被 isInternalField() 误判
2. **点击无响应**：检查 bindMarkerContextMenu() 是否绑定
3. **表格不更新**：确认 updateFeatureTable() 被调用

---

## 文档维护

每次修复/更新需要同步：
1. 更新 `updatedocs/CHANGELOG.md`
2. 更新 `CHANGELOG.md`（根目录）
3. 必要时更新本开发者指南
