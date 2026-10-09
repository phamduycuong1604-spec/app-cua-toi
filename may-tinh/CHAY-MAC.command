#!/bin/bash
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null; then
  echo "Chưa có Python. Đang mở trang tải…"; open https://www.python.org/downloads/; exit 1
fi
[ -x .venv/bin/python ] || { echo "Lần đầu: đang cài đặt, chờ 1-2 phút…"; python3 -m venv .venv; }
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q --upgrade -r requirements.txt
.venv/bin/python phaha_tool.py
