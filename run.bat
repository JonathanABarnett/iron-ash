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
echo  ║  5.  Player-count balance (1v1 / 1v2 / 1v3) ║
echo  ║  6.  Skill-level test  (Easy vs Hard AI)     ║
echo  ║  7.  Run unit tests                          ║
echo  ║  8.  Build + Typecheck                       ║
echo  ║  9.  Open rulebook                           ║
echo  ║  0.  Exit                                    ║
echo  ║                                              ║
echo  ╚══════════════════════════════════════════════╝
echo.
set /p choice="  Choose [0-9]: "

if "%choice%"=="1" goto DEV
if "%choice%"=="2" goto BROWSER
if "%choice%"=="3" goto SIM_QUICK
if "%choice%"=="4" goto SIM_FULL
if "%choice%"=="5" goto SIM_PLAYER_COUNT
if "%choice%"=="6" goto SIM_LEVELS
if "%choice%"=="7" goto TEST
if "%choice%"=="8" goto BUILD
if "%choice%"=="9" goto RULEBOOK
if "%choice%"=="0" goto EXIT
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

:SIM_PLAYER_COUNT
echo.
echo  Player-count balance test (1v1, 1v2, 1v3 — exhaustive matchups)
echo  ─────────────────────────────────────────────────────────────
set NODE_OPTIONS=--max-old-space-size=4096
echo.
echo  [1/1] Running 1v1 (28 matchups x 20 games)...
npx tsx scripts/test-player-counts.ts
echo.
echo  ─────────────────────────────────────────────────────────────
echo  Done. All counts should show no faction warnings.
echo.
pause
goto MENU

:SIM_LEVELS
echo.
echo  Skill-level variability test (Easy / Medium / Hard AI)
echo  ─────────────────────────────────────────────────────────────
set NODE_OPTIONS=--max-old-space-size=4096
echo.
echo  [1/3] 1v1 scenarios...
npx tsx scripts/test-player-levels.ts --count=2
echo.
echo  [2/3] 3-player scenarios...
npx tsx scripts/test-player-levels.ts --count=3
echo.
echo  [3/3] 4-player scenarios...
npx tsx scripts/test-player-levels.ts --count=4
echo.
echo  ─────────────────────────────────────────────────────────────
echo  Key finding: faction advantage typically outweighs skill level.
echo  Hard AI loses to Easy AI in multi-player (unpredictability effect).
echo.
pause
goto MENU

:TEST
echo.
echo  Running engine unit tests...
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
echo  Building production bundle + TypeScript check...
echo.
npx tsc --noEmit
if %errorlevel%==0 (
  echo  Types OK. Building...
  pnpm build
  if %errorlevel%==0 (
    echo  Build successful!
  ) else (
    echo  BUILD FAILED. Check errors above.
  )
) else (
  echo  Type errors found. Fix before building.
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

REM ── Error recovery ─────────────────────────────────────────────────────────
:INVALID
echo  Invalid choice. Press any key to return to menu.
pause >nul
goto MENU
