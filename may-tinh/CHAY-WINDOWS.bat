@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PhaHa Tool

where py >nul 2>nul && (set PY=py) || (set PY=python)
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo Chua co Python. Dang mo trang tai Python...
  echo Cai xong nho tick "Add python.exe to PATH", roi bam dup lai file nay.
  start https://www.python.org/downloads/
  pause
  exit /b
)

if not exist ".venv\Scripts\python.exe" (
  echo Lan dau: dang cai dat, cho 1-2 phut...
  %PY% -m venv .venv
)
".venv\Scripts\python.exe" -m pip install -q --upgrade pip
".venv\Scripts\python.exe" -m pip install -q --upgrade -r requirements.txt
start "" ".venv\Scripts\pythonw.exe" phaha_tool.py
