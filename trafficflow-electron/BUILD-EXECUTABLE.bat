@echo off
title TrafficFlow Enterprise - Build Executable
cls
echo.
echo  ╔═══════════════════════════════════════════════════════════╗
echo  ║                                                           ║
echo  ║         TrafficFlow v18.0 Enterprise                      ║
echo  ║         Building Windows Executable                       ║
echo  ║                                                           ║
echo  ╚═══════════════════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed!
    echo  Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo  [1/3] Installing dependencies...
call npm install

echo.
echo  [2/3] Building Windows executable...
call npm run build

echo.
echo  [3/3] Build complete!
echo.
echo  The executable files are in the 'dist' folder:
echo  - TrafficFlow Enterprise Setup.exe (Installer)
echo  - TrafficFlow Enterprise.exe (Portable)
echo.
pause
