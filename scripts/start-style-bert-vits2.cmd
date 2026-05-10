@echo off
cd /d "%~dp0\.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-style-bert-vits2.ps1"
