@echo off
title Iron ^& Ash — Dev Server
echo.
echo  ==========================================
echo   Iron ^& Ash   playtesting environment
echo  ==========================================
echo.
echo  Starting dev server at http://localhost:5180
echo  Press Ctrl+C to stop.
echo.
cd /d "%~dp0"
pnpm dev
pause
