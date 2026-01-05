@echo off
REM CodexFlow IDE - Development Script
REM Bu script CodexFlow IDE'yi development modunda çalıştırır

echo ========================================
echo CodexFlow IDE - Development Mode
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed!
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencies already installed
)

echo.
echo [2/3] Compiling TypeScript...
call npm run gulp compile
if errorlevel 1 (
    echo ERROR: Compilation failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Launching CodexFlow IDE...
echo.
echo ========================================
echo CodexFlow IDE is starting...
echo Press Ctrl+C to stop
echo ========================================
echo.

call npm run electron

pause
