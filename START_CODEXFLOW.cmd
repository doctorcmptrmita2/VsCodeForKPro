@echo off
REM CodexFlow IDE - Quick Start Script
REM Bu script CodexFlow IDE'yi en hizli sekilde baslatir

echo ========================================
echo CodexFlow IDE - Quick Start
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js bulunamadi!
    echo Lutfen Node.js yukleyin: https://nodejs.org
    pause
    exit /b 1
)

REM Check if in vscode directory
if not exist "package.json" (
    echo ERROR: Bu script vscode klasorunde calistirilmali!
    echo.
    echo Kullanim:
    echo   cd vscode
    echo   START_CODEXFLOW.cmd
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/3] Bagimliliklari yukleniyor...
    echo Bu islem ilk seferde 5-10 dakika surebilir.
    echo.
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install basarisiz!
        pause
        exit /b 1
    )
) else (
    echo [1/3] Bagimliliklar zaten yuklu
)

echo.
echo [2/3] VS Code kaynak kodlari hazirlaniyor...
echo Bu islem arka planda devam edecek.
echo.

REM Start watch in background (new window)
start "CodexFlow Watch" cmd /c "npm run watch"

echo Derleme basladi (arka plan)...
echo Lutfen 30 saniye bekleyin...
echo.

REM Wait for initial compilation
timeout /t 30 /nobreak >nul

echo.
echo [3/3] CodexFlow IDE baslatiliyor...
echo.
echo ========================================
echo CodexFlow IDE aciliyor...
echo Kapatmak icin bu pencereyi kapatabilirsiniz
echo ========================================
echo.

REM Run electron
call npm run electron

pause
