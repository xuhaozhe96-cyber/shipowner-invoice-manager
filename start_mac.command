#!/bin/bash

cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "没有找到 Python 3。"
  echo "请先从 https://www.python.org/downloads/macos/ 安装 Python 3.10 或更高版本。"
  read -r -p "按回车键关闭..."
  exit 1
fi

if [ ! -d ".venv-mac" ]; then
  echo "首次运行：正在建立 Mac 本地运行环境..."
  python3 -m venv .venv-mac || {
    echo "建立运行环境失败。请确认已经安装 Python 3.10 或更高版本。"
    read -r -p "按回车键关闭..."
    exit 1
  }
fi

echo "正在检查程序所需组件..."
".venv-mac/bin/python" -m pip install -r requirements.txt || {
  echo "组件安装失败。请检查网络连接后重新双击此文件。"
  read -r -p "按回车键关闭..."
  exit 1
}

echo
echo "正在启动 Shipowner Invoice Manager..."
echo "浏览器将自动打开 http://127.0.0.1:5050"
echo "使用期间请保持这个窗口开启；需要停止时按 Control+C。"
echo

export SHIPOWNER_OPEN_BROWSER=1
export SHIPOWNER_PORT=5050
exec ".venv-mac/bin/python" app.py
