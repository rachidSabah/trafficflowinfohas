@echo off
title TrafficFlow v18.0 Enterprise
cls
echo.
echo  ╔═══════════════════════════════════════════════════════════╗
echo  ║                                                           ║
echo  ║         TrafficFlow v18.0 Enterprise                      ║
echo  ║         SEO Traffic Management Platform                   ║
echo  ║                                                           ║
echo  ╚═══════════════════════════════════════════════════════════╝
echo.
echo  Starting application...
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please install Node.js from: https://nodejs.org/
    echo  Choose the LTS version for best compatibility.
    echo.
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "node_modules" (
    echo  Installing dependencies...
    call npm install
    echo.
)

:: Start the application
echo  Launching TrafficFlow Enterprise...
echo.
start "" npx electron .

echo  TrafficFlow is now running!
echo  You can close this window.
timeout /t 3 >nul
