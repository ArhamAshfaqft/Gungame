@echo off
cd /d "%~dp0"
title Fast Snipe - Private Multiplayer Host
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js is required. Install Node.js 22 LTS, then open this launcher again.
 pause
 exit /b 1
)
if not exist node_modules\@colyseus\core (
 echo Multiplayer packages are missing. Run npm install in this folder first.
 pause
 exit /b 1
)
echo Preparing your game, then starting the private server...
node scripts\host-private.mjs
pause
