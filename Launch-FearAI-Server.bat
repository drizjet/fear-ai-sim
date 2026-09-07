@echo off
title Fear AI Universal Middleware Server
echo Starting Fear AI Universal Middleware Server on port 8765...
cd /d "%~dp0fear-ai-sim"
node packages/runtime/bin/fear-ai-server.js --port 8765 --seed 1337
pause
