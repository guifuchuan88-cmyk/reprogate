#!/bin/zsh

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js 22+。请先安装 Node.js，再运行此启动器。"
  read -r "?按回车键关闭窗口…"
  exit 1
fi

node scripts/serve.mjs --dir . --port 4173 &
server_pid=$!
sleep 1
open "http://127.0.0.1:4173"
wait "$server_pid"
