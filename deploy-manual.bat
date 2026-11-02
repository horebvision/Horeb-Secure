@echo off
chcp 65001 > nul
echo ========================================================
echo   DEPLOIEMENT MANUEL EN PRODUCTION - HOREB SECURE
echo ========================================================
echo.
cd /d "%~dp0"
node scripts\deploy-manual.js
echo.
pause
