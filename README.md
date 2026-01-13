# GeoJSON 地图编辑器

[![Version](https://img.shields.io/badge/version-v2.9.1-blue.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> ⚠️ **隐私声明**：本项目不包含任何真实或测试业务数据，仅提供代码结构与功能实现。

一个功能完整的 **GeoJSON 地图编辑器**，类似 [geojson.io](https://geojson.io)，基于 Leaflet 构建。

## ✨ 核心功能

- **绘图工具** - 标记、折线、多边形、矩形、圆形（Leaflet.draw）
- **GeoJSON 导入/导出** - 完整格式支持
- **Excel 导入/导出** - 支持 `.xlsx` 格式，包含所有字段
- **图层管理** - 显示/隐藏/重命名/删除图层
- **表格视图** - Tabulator 集成，虚拟滚动，单元格编辑
- **时间轴快照** - 保存/加载不同时间点的地图状态
- **组合标记** - 同坐标多标记自动合并，放射展开（Spiderfy）
- **四向联动** - Table / 地图 / 图层面板 / 属性编辑器 同步选中

## 🚀 快速开始

```powershell
# 启动本地服务器
python server.py

# 或使用简单 HTTP 服务
python -m http.server 8000
```

浏览器访问：`http://localhost:8000`

## 📁 项目结构

```
Geomap-app/
├── index.html              # 主入口
├── script.js               # 核心逻辑
├── style.css               # 样式
├── timeline-manager.js     # 时间轴快照模块
├── table-view.js           # 表格视图模块
├── marker-group.js         # 组合标记模块
├── selection-manager.js    # 选中状态管理
├── property-editor.js      # 属性编辑器
├── server.py               # 本地服务器
└── updatedocs/             # 开发文档
    ├── API_REFERENCE.md    # API 参考
    ├── DEVELOPER_GUIDE.md  # 开发指南
    └── DOC_WORKFLOW.md     # 文档维护规则
```

## 📖 文档

| 文档 | 说明 |
|------|------|
| [CHANGELOG.md](CHANGELOG.md) | 完整版本更新日志 |
| [updatedocs/API_REFERENCE.md](updatedocs/API_REFERENCE.md) | API 参考 |
| [updatedocs/DEVELOPER_GUIDE.md](updatedocs/DEVELOPER_GUIDE.md) | 开发指南 |
| [GitHub部署指南.md](GitHub部署指南.md) | GitHub Pages 部署 |
| [使用说明-面板控制.md](使用说明-面板控制.md) | 面板控制说明 |

## ⚙️ 配置高德 API Key（可选）

仅 **搜索地址** 功能需要 API Key：

```javascript
// script.js 第 2 行
const AMAP_API_KEY = '你的密钥';
```

## � License

MIT License
