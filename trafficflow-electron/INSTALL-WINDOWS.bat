@echo off
title TrafficFlow Enterprise - Installer
cls
echo.
echo  ╔═══════════════════════════════════════════════════════════╗
echo  ║                                                           ║
echo  ║         TrafficFlow v18.0 Enterprise                      ║
echo  ║         Windows Installer                                 ║
echo  ║                                                           ║
echo  ╚═══════════════════════════════════════════════════════════╝
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [INFO] Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: Check Node.js
echo  [1/4] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  [INFO] Node.js not found. Installing Node.js...
    
    :: Download Node.js LTS
    powershell -Command "& {Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\nodejs.msi'}"
    
    :: Install Node.js silently
    msiexec /i "%TEMP%\nodejs.msi" /qn /norestart
    
    echo  [OK] Node.js installed successfully!
    
    :: Refresh environment
    call refreshenv >nul 2>&1
) else (
    echo  [OK] Node.js is installed
)

:: Install dependencies
echo.
echo  [2/4] Installing application dependencies...
cd /d "%~dp0"
call npm install --silent
echo  [OK] Dependencies installed

:: Create desktop shortcut
echo.
echo  [3/4] Creating desktop shortcut...
set "SHORTCUT=%USERPROFILE%\Desktop\TrafficFlow Enterprise.lnk"
set "TARGET=%~dp0START-WINDOWS.bat"
powershell -Command "& {$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'TrafficFlow Enterprise v18.0'; $s.Save()}"
echo  [OK] Desktop shortcut created

:: Create Start Menu entry
echo.
echo  [4/4] Creating Start Menu entry...
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\TrafficFlow Enterprise.lnk"
powershell -Command "& {$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTMENU%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'TrafficFlow Enterprise v18.0'; $s.Save()}"
echo  [OK] Start Menu entry created

echo.
echo  ╔═══════════════════════════════════════════════════════════╗
echo  ║                                                           ║
echo  ║         INSTALLATION COMPLETE!                           ║
echo  ║                                                           ║
echo  ║  You can now launch TrafficFlow Enterprise from:         ║
echo  ║  - Desktop shortcut                                       ║
echo  ║  - Start Menu                                             ║
echo  ║  - Or run START-WINDOWS.bat in this folder                ║
echo  ║                                                           ║
echo  ╚═══════════════════════════════════════════════════════════╝
echo.
echo  Press any key to launch TrafficFlow now...
pause >nul

:: Launch the application
start "" "%~dp0START-WINDOWS.bat"
