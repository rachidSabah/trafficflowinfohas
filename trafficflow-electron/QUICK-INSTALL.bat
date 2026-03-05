@echo off
title TrafficFlow Enterprise - Quick Install
cls
echo.
echo  ================================================================
echo            TrafficFlow v18.0 Enterprise - Quick Install
echo  ================================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [INFO] Node.js is not installed. Downloading...
    echo.
    
    :: Download Node.js silently
    powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\nodejs.msi' -UseBasicParsing }"
    
    if exist "%TEMP%\nodejs.msi" (
        echo  Installing Node.js...
        msiexec /i "%TEMP%\nodejs.msi" /qn /norestart
        
        :: Add Node.js to PATH
        set "PATH=%ProgramFiles%\nodejs\;%PATH%"
        
        echo  [OK] Node.js installed!
    ) else (
        echo  [ERROR] Could not download Node.js
        echo  Please install manually from https://nodejs.org/
        pause
        exit /b 1
    )
)

:: Install dependencies
echo  Installing application dependencies...
echo  This may take a few minutes...
echo.

cd /d "%~dp0"
call npm install --loglevel=error

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Failed to install dependencies
    echo  Please check your internet connection
    pause
    exit /b 1
)

echo.
echo  ================================================================
echo                    INSTALLATION COMPLETE!
echo  ================================================================
echo.
echo  TrafficFlow Enterprise is now ready to use!
echo.
echo  Starting application...
echo.

:: Start the application
start "" npx electron .

timeout /t 3 >nul
exit
