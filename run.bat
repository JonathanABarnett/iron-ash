@echo off
title Iron ^& Ash — Launcher
cd /d "%~dp0"

:MENU
cls
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║          Iron ^& Ash  — Playtesting           ║
echo  ║      Medieval fantasy dice-placement          ║
echo  ╠══════════════════════════════════════════════╣
echo  ║                                              ║
echo  ║  1.  Start dev server  (http://localhost:5180)║
echo  ║  2.  Open in browser   (after server starts) ║
echo  ║  3.  Quick balance sim (100 games)           ║
echo  ║  4.  Full balance sim  (500 games)           ║
echo  ║  5.  Run all tests                           ║
echo  ║  6.  Build production                        ║
echo  ║  7.  Typecheck (TypeScript)                  ║
echo  ║  8.  Open rulebook                           ║
echo  ║  9.  Exit                                    ║
echo  ║                                              ║
echo  ╚══════════════════════════════════════════════╝
echo.
set /p choice="  Choose [1-9]: "

if "%choice%"=="1" goto DEV
if "%choice%"=="2" goto BROWSER
if "%choice%"=="3" goto SIM_QUICK
if "%choice%"=="4" goto SIM_FULL
if "%choice%"=="5" goto TEST
if "%choice%"=="6" goto BUILD
if "%choice%"=="7" goto TYPECHECK
if "%choice%"=="8" goto RULEBOOK
if "%choice%"=="9" goto EXIT
echo  Invalid choice. Try again.
timeout /t 1 >nul
goto MENU

:DEV
echo.
echo  Starting dev server at http://localhost:5180
echo  Press Ctrl+C to stop the server, then close this window.
echo.
start "" "http://localhost:5180"
pnpm dev
goto MENU

:BROWSER
echo.
echo  Opening http://localhost:5180 in your default browser...
start "" "http://localhost:5180"
timeout /t 2 >nul
goto MENU

:SIM_QUICK
echo.
echo  Running quick balance check (100 games, medium difficulty)...
echo  ─────────────────────────────────────────────────────────────
echo.
set NODE_OPTIONS=--max-old-space-size=2048
npx tsx scripts/run-sim.ts --games=100 --difficulty=medium
echo.
echo  ─────────────────────────────────────────────────────────────
echo  Done. Check warnings above for balance issues.
echo.
pause
goto MENU

:SIM_FULL
echo.
echo  Running full balance check (500 games, medium difficulty)...
echo  This takes about 10 seconds.
echo  ─────────────────────────────────────────────────────────────
echo.
set NODE_OPTIONS=--max-old-space-size=2048
npx tsx scripts/run-sim.ts --games=500 --difficulty=medium
echo.
echo  ─────────────────────────────────────────────────────────────
echo  Done. All faction win rates should be within +-10pp of mean.
echo  Targets: Round-7 reach 30-50%%, Fortress turnover ^>60%%.
echo.
pause
goto MENU

:TEST
echo.
echo  Running 93 engine tests...
echo  ─────────────────────────────────────────────────────────────
echo.
pnpm test
echo.
echo  ─────────────────────────────────────────────────────────────
echo.
pause
goto MENU

:BUILD
echo.
echo  Building production bundle...
echo.
pnpm build
echo.
if %errorlevel%==0 (
  echo  Build successful! Serve with: pnpm preview
  echo  Or double-click run.bat and choose option 1 for dev server.
) else (
  echo  BUILD FAILED. Check TypeScript errors above.
)
echo.
pause
goto MENU

:TYPECHECK
echo.
echo  Running TypeScript strict typecheck...
echo  ─────────────────────────────────────────────────────────────
echo.
npx tsc --noEmit
echo.
if %errorlevel%==0 (
  echo  All types OK.
) else (
  echo  Type errors found. See above.
)
echo.
pause
goto MENU

:RULEBOOK
echo.
echo  Opening rulebook in browser...
echo  (Make sure the dev server is running first - option 1)
echo.
start "" "http://localhost:5180/rules"
timeout /t 2 >nul
goto MENU

:EXIT
echo.
echo  Goodbye!
echo.
exit /b 0
