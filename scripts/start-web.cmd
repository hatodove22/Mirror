@echo off
cd /d "%~dp0\.."
set "VITE_PORT=5173"
set "VITE_API_PROXY_TARGET=http://127.0.0.1:8004"
npm.cmd --prefix frontend run dev -- --host 0.0.0.0 --port 5173
