@echo off
REM CodexFlow IDE - Watch Mode Script
REM Bu script değişiklikleri otomatik derler

echo ========================================
echo CodexFlow IDE - Watch Mode
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed!
        pause
        exit /b 1
    )
)

echo.
echo Starting watch mode...
echo Changes will be compiled automatically
echo Press Ctrl+C to stop
echo.
echo ========================================
echo.

call npm run watch

pause
