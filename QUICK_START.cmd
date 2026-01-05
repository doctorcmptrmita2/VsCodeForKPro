@echo off
REM CodexFlow IDE - Ultra Quick Start
REM Compile olmadan direkt calistirir (development mode)

echo ========================================
echo CodexFlow IDE - Development Mode
echo ========================================
echo.

if not exist "package.json" (
    echo HATA: vscode klasorunde calistirilmali!
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Bagimliliklar yukleniyor...
    call npm install
)

echo.
echo CodexFlow IDE baslatiliyor...
echo (Development mode - compile gerekmez)
echo.

REM Use the code.bat script which handles everything
call scripts\code.bat

pause
