@echo off
chcp 65001 >nul
title GeoJSON 地图编辑器 - 本地服务器

echo ========================================
echo    GeoJSON 地图编辑器
echo ========================================
echo.
echo 正在启动本地服务器...
echo.
echo 提示：
echo  * 浏览器将自动打开
echo  * 如果端口被占用，将自动尝试其他端口
echo  * 关闭此窗口/按 Ctrl+C 可停止服务器
echo ========================================
echo.

:: 启动 Python HTTP 服务器脚本
python server.py

pause
