# 文档维护工作流

## 文档结构

```
Geomap-app/
├── README.md           # GitHub 首页（简洁概述）
├── CHANGELOG.md        # 唯一权威版本日志
└── updatedocs/
    ├── DEVELOPER_GUIDE.md   # 开发者指南（架构、模块、设计决策）
    ├── API_REFERENCE.md     # API 参考（公开函数、方法、事件）
    ├── DOC_WORKFLOW.md      # 文档维护规则（本文档）
    └── ARCHIVE_CHANGELOG.md # 历史存档（已废弃，仅供参考）
```

---

## 每次修复/更新时必须同步的文档

### 1. CHANGELOG.md（根目录 - 唯一权威日志）
- 添加新版本号和日期
- 详细列出所有变更
- 分类：🐛修复、✨新功能、🛠️改进

### 2. DEVELOPER_GUIDE.md（如有架构变更）
- 新模块/函数添加说明
- 更新项目结构
- 更新调试技巧

### 3. API_REFERENCE.md（如有 API 变更）
- 新公开函数添加文档
- 更新全局变量列表

---

## 版本号规范

`主版本.次版本.修订号`

- **主版本**：重大架构变更
- **次版本**：新功能添加
- **修订号**：Bug 修复

---

## CHANGELOG 条目模板

```markdown
## [vX.X.X] - YYYY-MM-DD

### 🐛 Bug 修复
- 修复内容描述

### ✨ 新功能
- 功能描述

### 🎨 UI 优化
- 优化描述
```

---

## 更新步骤

1. 完成代码修改
2. 更新根目录 `CHANGELOG.md`
3. 必要时更新开发者文档
4. 测试验证
5. 提交代码
