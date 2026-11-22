@echo off
chcp 65001 >nul
title DeepSeek Harness 启动器 (dsh web 3080)

set "URL=http://127.0.0.1:3080"

echo ==============================================
echo  DeepSeek Harness 启动器 (PWA / 浏览器版)
echo  端口: 3080  (与桌面安装包的 18632 不冲突)
echo ==============================================
echo.

echo [1/5] 检查全局 dsh 命令...
where dsh >nul 2>nul
if errorlevel 1 (
    echo   [错误] 未找到 dsh 命令。
    echo.
    echo   请先全局安装 DeepSeek Harness CLI：
    echo     npm install -g @deepseek-ai/dsh
    echo.
    echo   安装完成后，再运行本脚本。
    goto fail
)
echo   已找到全局 dsh 命令。

echo.
echo [2/5] 检查 3080 端口是否已在运行...
netstat -ano | findstr ":3080" | findstr "LISTENING" >nul 2>nul
if %errorlevel%==0 (
    echo   3080 端口已在监听，服务已在运行。
    goto open
)

echo.
echo [3/5] 启动 dsh web（必须使用全局命令，禁止 npx）...
echo   正在执行: dsh web --host 127.0.0.1 --port 3080
start "dsh-web-3080" /min dsh web --host 127.0.0.1 --port 3080
if errorlevel 1 (
    echo   [错误] 启动失败。
    goto fail
)
echo   服务已启动，等待初始化...
timeout /t 10 /nobreak >nul

echo.
echo [4/5] 等待服务就绪...
set /a retries=0
:wait_loop
curl -s -o nul -w "%%{http_code}" "%URL%" | findstr "200" >nul 2>nul
if %errorlevel%==0 goto open
set /a retries+=1
if %retries% geq 18 (
    echo   服务可能仍在初始化，继续打开浏览器/PWA...
    goto open
)
timeout /t 2 /nobreak >nul
goto wait_loop

:open
echo.
echo [5/5] 打开 DeepSeek Harness ...

:: 优先尝试打开已安装的 Edge PWA 快捷方式
if exist "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk" (
    start "" "%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk"
    goto done
)
if exist "%USERPROFILE%\Desktop\DeepSeek Harness.lnk" (
    start "" "%USERPROFILE%\Desktop\DeepSeek Harness.lnk"
    goto done
)

:: 回退：用默认浏览器打开本地地址
start "" "%URL%"

goto done

:fail
echo.
echo 启动失败。常见原因：
echo   1. 未执行 `npm install -g @deepseek-ai/dsh`
echo   2. 使用了 npx 启动导致找不到 profile bundle（本脚本已避免）
echo   3. 系统代理 / VPN / Clash TUN 拦截了 127.0.0.1，临时关闭后重试
echo   4. 全局 dsh 的 profile 依赖未安装，可尝试：dsh plugin --profile web install
echo.
pause
exit /b 1

:done
echo.
echo 完成。如果浏览器/PWA 空白或超时：
echo   - 检查系统代理/VPN是否拦截 127.0.0.1:3080
echo   - 查看日志：%%USERPROFILE%%\.dsh\desktop.log
echo.
pause
exit /b 0
