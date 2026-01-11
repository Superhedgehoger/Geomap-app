@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ========================================
:: GeoJSON 地图编辑器 - 自动打包脚本
:: ========================================

title GeoJSON 地图编辑器 - 便携版打包工具

echo.
echo ========================================
echo   GeoJSON 地图编辑器 - 便携版打包工具
echo ========================================
echo.

:: 设置变量
set "PACKAGE_NAME=GeoJSON地图编辑器-便携版"
set "PYTHON_VERSION=3.11.0"
set "PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip"

:: 创建临时文件夹
if exist "%PACKAGE_NAME%" (
    echo 删除旧的打包文件夹...
    rmdir /s /q "%PACKAGE_NAME%"
)

echo 创建打包文件夹结构...
mkdir "%PACKAGE_NAME%"
mkdir "%PACKAGE_NAME%\python"
mkdir "%PACKAGE_NAME%\app"

:: 复制应用文件
echo.
echo 复制应用文件...
xcopy /E /I /Y "index.html" "%PACKAGE_NAME%\app\" >nul
xcopy /E /I /Y "script.js" "%PACKAGE_NAME%\app\" >nul
xcopy /E /I /Y "style.css" "%PACKAGE_NAME%\app\" >nul
xcopy /E /I /Y "快速启动.html" "%PACKAGE_NAME%\app\" >nul
xcopy /E /I /Y "README.md" "%PACKAGE_NAME%\app\" >nul

if exist "example.geojson" (
    xcopy /E /I /Y "example.geojson" "%PACKAGE_NAME%\app\" >nul
)

:: 创建启动脚本
echo.
echo 创建启动脚本...
(
echo @echo off
echo chcp 65001 ^>nul
echo title GeoJSON 地图编辑器
echo.
echo cd /d "%%~dp0"
echo echo ========================================
echo echo    GeoJSON 地图编辑器
echo echo ========================================
echo echo.
echo echo 正在启动本地服务器...
echo echo 服务器地址: http://localhost:8000
echo echo.
echo echo 提示：关闭此窗口将停止服务器
echo echo ========================================
echo echo.
echo.
echo timeout /t 1 /nobreak ^>nul
echo start http://localhost:8000/快速启动.html
echo.
echo cd app
echo ..\python\python.exe -m http.server 8000
echo.
echo pause
) > "%PACKAGE_NAME%\启动.bat"

:: 创建使用说明
echo.
echo 创建使用说明...
(
echo ========================================
echo   GeoJSON 地图编辑器 - 使用说明
echo ========================================
echo.
echo 【快速开始】
echo 1. 双击"启动.bat"文件
echo 2. 等待浏览器自动打开
echo 3. 开始使用地图编辑器
echo.
echo 【系统要求】
echo - Windows 7 或更高版本
echo - 任意现代浏览器（Chrome/Edge/Firefox）
echo - 无需安装 Python 或其他软件
echo.
echo 【功能特点】
echo ✓ Leaflet.draw 绘图工具
echo ✓ Excel/CSV 导入导出
echo ✓ GeoJSON 完整支持
echo ✓ 标记弹窗与坐标复制
echo ✓ 图层管理
echo ✓ 代码编辑器
echo.
echo 【常见问题】
echo Q: 启动后浏览器没有自动打开？
echo A: 手动访问 http://localhost:8000
echo.
echo Q: 提示端口被占用？
echo A: 关闭其他占用 8000 端口的程序
echo.
echo Q: 防火墙警告？
echo A: 选择"允许访问"即可
echo.
echo 【技术支持】
echo 详细文档：app/README.md
echo.
echo ========================================
) > "%PACKAGE_NAME%\使用说明.txt"

:: 提示下载 Python
echo.
echo ========================================
echo 重要提示：
echo ========================================
echo.
echo 由于 Python Embedded 版本较大（约 12MB），
echo 需要手动下载并解压到以下位置：
echo.
echo   %CD%\%PACKAGE_NAME%\python\
echo.
echo 下载地址：
echo %PYTHON_URL%
echo.
echo 或访问：https://www.python.org/downloads/windows/
echo 搜索：Windows embeddable package (64-bit)
echo.
echo ========================================
echo.

:: 询问是否自动下载
set /p "AUTO_DOWNLOAD=是否尝试自动下载 Python？(Y/N): "
if /i "%AUTO_DOWNLOAD%"=="Y" (
    echo.
    echo 正在下载 Python Embedded...
    echo 这可能需要几分钟，请耐心等待...
    
    :: 使用 PowerShell 下载
    powershell -Command "& {Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile 'python-embed.zip'}"
    
    if exist "python-embed.zip" (
        echo.
        echo 正在解压 Python...
        powershell -Command "& {Expand-Archive -Path 'python-embed.zip' -DestinationPath '%PACKAGE_NAME%\python' -Force}"
        del "python-embed.zip"
        echo Python 解压完成！
    ) else (
        echo.
        echo 下载失败，请手动下载并解压。
    )
)

echo.
echo ========================================
echo 打包完成！
echo ========================================
echo.
echo 便携版文件夹：%PACKAGE_NAME%
echo.
echo 下一步：
if not exist "%PACKAGE_NAME%\python\python.exe" (
    echo 1. 下载 Python Embedded 并解压到 python 文件夹
    echo 2. 测试运行"启动.bat"
    echo 3. 压缩整个文件夹为 ZIP 分发
) else (
    echo 1. 测试运行"启动.bat"
    echo 2. 压缩整个文件夹为 ZIP 分发
)
echo.
echo ========================================
echo.

pause
