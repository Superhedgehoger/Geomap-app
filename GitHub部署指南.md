# GitHub Pages 部署指南

本指南将帮助你将 GeoJSON 地图编辑器部署到 GitHub Pages，使其可以通过互联网访问。

## 1. 准备工作

1.  **注册 GitHub 账号**：如果你还没有，请访问 [github.com](https://github.com/) 注册。
2.  **安装 Git（可选）**：虽然可以通过网页上传，但安装 Git 会更方便。

## 2. 创建仓库 (Repository)

1.  登录 GitHub。
2.  点击右上角的 **+** 号，选择 **New repository**。
3.  **Repository name**：输入 `map-editor`（或你喜欢的名字）。
4.  **Public/Private**：选择 **Public**（免费版 GitHub Pages 需要公开仓库）。
5.  勾选 **Add a README file**。
6.  点击 **Create repository**。

## 3. 上传文件

### 方法 A：通过网页上传（最简单）

1.  在仓库页面，点击 **Add file** > **Upload files**。
2.  将以下文件拖拽到上传区域：
    *   `map-app-single.html` (建议重命名为 `index.html` 以便直接访问)
    *   或者上传完整项目：`index.html`, `style.css`, `script.js`
3.  在 "Commit changes" 区域，输入描述（例如 "Initial commit"）。
4.  点击 **Commit changes**。

### 方法 B：使用 Git 命令行

1.  在本地项目文件夹打开终端 (Terminal) 或 Git Bash。
2.  初始化 Git 仓库：
    ```bash
    git init
    ```
3.  添加文件：
    ```bash
    git add .
    ```
4.  提交更改：
    ```bash
    git commit -m "Initial commit"
    ```
5.  关联远程仓库（将 `YOUR_USERNAME` 替换为你的 GitHub 用户名）：
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/map-editor.git
    ```
6.  推送到 GitHub：
    ```bash
    git branch -M main
    git push -u origin main
    ```

## 4. 开启 GitHub Pages

1.  在仓库页面，点击 **Settings**（设置）。
2.  在左侧菜单栏，点击 **Pages**。
3.  在 **Build and deployment** 下的 **Source**，选择 **Deploy from a branch**。
4.  在 **Branch** 下，选择 **main** 分支，文件夹选择 **/(root)**。
5.  点击 **Save**。

## 5. 访问你的网站

1.  等待几分钟（通常 1-2 分钟）。
2.  刷新 Pages 设置页面。
3.  你会看到顶部显示：**Your site is live at...**
4.  点击链接即可访问你的地图编辑器！
    *   地址通常是：`https://YOUR_USERNAME.github.io/map-editor/`

## 常见问题

*   **Q: 页面显示 404 错误？**
    *   A: 确保你的主文件名为 `index.html`。如果你上传的是 `map-app-single.html`，访问地址后面需要加上文件名：`.../map-editor/map-app-single.html`。
*   **Q: 地图加载不出来？**
    *   A: 检查浏览器控制台 (F12) 是否有错误。GitHub Pages 使用 HTTPS，确保所有引用的资源（如 API）也支持 HTTPS。
*   **Q: Excel 导入/导出功能不能用？**
    *   A: 这些功能是纯前端实现的，应该可以正常工作。如果不行，检查 CDN 链接是否被拦截。

---
**祝贺！你已成功部署 GeoJSON 地图编辑器！** 🌍🚀
