# Geomap 经营决策地图

<div align="center">

[![Version](https://img.shields.io/badge/version-v4.1.0--beta.3-blue.svg)](CHANGELOG.md)
[![CI](https://github.com/Superhedgehoger/Geomap-app/actions/workflows/ci.yml/badge.svg)](https://github.com/Superhedgehoger/Geomap-app/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**[在线体验](https://superhedgehoger.github.io/Geomap-app/) · [Lite 版](https://superhedgehoger.github.io/Geomap-app/?variant=lite) · [更新日志](CHANGELOG.md)**

面向管理层、拓展和运营团队的门店网络决策工作台：先看清当前经营版图，再逐步连接经营历史、自定义选址模型和经营数据。

Decision-oriented store-network workspace with private browser storage, map editing, history foundations, and portable offline distribution.

</div>

![Geomap 示例数据全景](docs/images/geomap-overview.png)

> 截图仅使用仓库内的虚构数据 [`examples/decision-demo.geojson`](examples/decision-demo.geojson)，不包含真实业务数据。

## 能做什么 · Highlights

| 能力       | 说明                                                        |
| ---------- | ----------------------------------------------------------- |
| 决策总览   | 门店总数、在营/筹备/闭店状态、区域覆盖、搜索和联动筛选      |
| 查看/编辑  | 管理层默认安全查看；显式进入编辑后使用完整地图维护能力      |
| 地图编辑   | 高德默认底图、完整避让标签、点线面和样式编辑                |
| 数据管理   | GeoJSON、Excel、CSV 导入导出，地图/图层/表格四向联动        |
| 组织与回溯 | 自定义分组、点聚合、历史快照和 schema v2 经营时空数据底座   |
| 经营时间   | 时间回放、五类记录、批量指标、A/B 差异、专题线和复盘视图    |
| 选址模型   | 四类模板、受限公式、版本发布、候选排行、贡献解释和决策报告  |
| 经营数据   | CSV/Excel 映射、质量预览、指标口径、KPI、趋势、排行与异常   |
| 私有协作   | 企业账号、版本协作、评论、经营事项、只读分享与审计          |
| 数据洞察   | 虚拟化表格、实时统计看板、可配置标记弹窗                    |
| 安全与隐私 | 数据保留在浏览器中，不上传；导入数据按不可信内容处理        |
| 分发       | GitHub Pages、Full/Lite 共用源码、可生成真正自包含的单 HTML |

## 立即使用 · Quick start

```bash
git clone https://github.com/Superhedgehoger/Geomap-app.git
cd Geomap-app
npm ci
npm run dev
```

Windows 用户也可以双击 `启动地图编辑器.bat`。它会进入项目目录、检查 Node.js/npm、首次安装或修复依赖、生成本地 vendor 资源并自动打开 Vite 服务。

打开终端输出的本地地址。生产构建使用：

```bash
npm run build:pages
npm run build:standalone:all
npm run build:release
```

输出位置：Pages 资源在 `dist/`，离线 Full/Lite 单文件在 `release/`；`build:release` 还会把两个离线模板复制到 `dist/downloads/`，供网页内“导出为单网页版”使用。

## Full 与 Lite

| 功能                         | Full |       Lite       |
| ---------------------------- | :--: | :--------------: |
| 绘制、分组、表格、快照、看板 |  ✅  |        ✅        |
| 事件追踪器及事件字段         |  ✅  |        ❌        |
| 自定义选址模型与决策情景     |  ✅  |        ❌        |
| 经营指标导入、质量与分析     |  ✅  |        ✅        |
| 私有服务连接与多人协作       |  ✅  |        ❌        |
| 访问方式                     | `/`  | `/?variant=lite` |

Lite 是公开能力配置，不维护第二套业务源码；事件数据在 Lite 的导入、显示和导出边界都会被移除。

## v4 私有协作

公开 Pages 和离线单文件始终是本地模式，不提供账号或云存储，请勿将真实经营数据发布到公开仓库。企业试点可另行启动私有服务：

```bash
cp server/.env.example .env
npm run private:server
```

然后使用 `?privateApi=https://your-private-api.example.com` 连接。Full 版支持组织初始化、12 小时会话、viewer/editor/admin/owner 权限、带版本号保存、冲突阻止、实体评论与 @提醒、经营事项和逾期跟踪、只读快照、决策简报、同步任务元数据和审计记录。生产部署必须使用 TLS、反向代理、独立备份和受控来源；完整说明见 [`updatedocs/V4_PRIVATE_DEPLOYMENT.md`](updatedocs/V4_PRIVATE_DEPLOYMENT.md) 和 [`updatedocs/V4_1_ACTION_ITEMS_CONTRACT.md`](updatedocs/V4_1_ACTION_ITEMS_CONTRACT.md)。

## 离线说明 · Offline behavior

单文件包含应用脚本、样式、字体和第三方库。完全断网时会切换为坐标网格底图，地图要素编辑、快照、表格和导入导出仍可使用；全球在线瓦片不会被打包进 HTML，联网后会自动恢复。

The standalone file embeds all application assets. With no network it uses a coordinate-grid background while editing and data tools remain available; global map tiles resume when connectivity returns.

## 工程结构

- `src/`：v3 TypeScript 核心，包括配置、类型、FeatureStore、数据边界、安全与存储迁移。
- 根目录旧版脚本：渐进迁移期间的兼容层，仍承载现有完整 Leaflet UI。
- `scripts/`：固定版本 vendor 资源、离线单文件和 README 截图生成。
- `tests/`：Vitest 单元测试、Python 兼容测试和 Playwright 浏览器回归。

开发质量命令：

```bash
npm run check
npm run test:e2e
npm run capture:readme
```

详细设计与迁移约束见 [`updatedocs/ARCHITECTURE_V3.md`](updatedocs/ARCHITECTURE_V3.md) 和 [`updatedocs/DEVELOPER_GUIDE.md`](updatedocs/DEVELOPER_GUIDE.md)。

经营时间与自定义选址模型的顺序规划见 [`updatedocs/DECISION_PLATFORM_ROADMAP.md`](updatedocs/DECISION_PLATFORM_ROADMAP.md)；当前 beta 的字段与验收边界见 [`updatedocs/V3_1_PRODUCT_CONTRACT.md`](updatedocs/V3_1_PRODUCT_CONTRACT.md)。

### 经营时间预览

![Geomap 经营时间轴](docs/images/geomap-history.png)

拖动或播放底部时间轴时，地图、KPI、门店状态、事件和经营指标保持同一时间上下文。记录模型及验收边界见 [`updatedocs/V3_2_PRODUCT_CONTRACT.md`](updatedocs/V3_2_PRODUCT_CONTRACT.md)。

### 自定义选址模型预览

![Geomap 自定义选址模型](docs/images/geomap-selection.png)

业务管理员可从商场店、临街店、社区店或空白模板建立企业模型；发布版本不可覆盖，候选点总分可追溯到原始字段、规则和权重。完整边界见 [`updatedocs/V3_3_PRODUCT_CONTRACT.md`](updatedocs/V3_3_PRODUCT_CONTRACT.md)。

### 经营数据中心预览

![Geomap 经营数据中心](docs/images/geomap-business-data.png)

CSV/Excel 在浏览器本地完成字段映射和质量预览；重复观测按复合主键明确更新、跳过或阻止。KPI、趋势、区域排行、门店明细和地图使用同一指标与筛选。完整边界见 [`updatedocs/V3_4_PRODUCT_CONTRACT.md`](updatedocs/V3_4_PRODUCT_CONTRACT.md)。

## 浏览器与设备

- Chrome、Edge、Firefox 当前主流版本，Safari 17+
- ≥1024px：完整编辑体验
- 768–1023px：平板核心编辑与底部表格
- <768px：地图浏览及导入导出；完整绘图请使用更大屏幕

## License

[MIT](LICENSE) © 2026 Superhedgehoger
