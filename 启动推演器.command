#!/bin/zsh

cd -- "$(dirname -- "$0")" || exit 1
export PATH="$PATH:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/opt/node@22/bin:/usr/local/bin"

url='http://127.0.0.1:47831/'

is_ready() {
  local page
  page=$(curl --noproxy 127.0.0.1 -fsS --max-time 1 "$url" 2>/dev/null) || return 1
  [[ "$page" == *'<title>走江踏浪 · 智能推演器</title>'* ]]
}

open_page() {
  printf '推演器地址：%s\n' "$url"
  open "$url" || printf '请将上述地址复制到浏览器。\n'
}

if is_ready; then
  ocr_info=$(curl --noproxy 127.0.0.1 -fsS --max-time 1 "${url}__tidal/ocr" 2>/dev/null)
  if [[ "$ocr_info" != *'"available":true'* ]]; then
    printf '当前是旧版服务。请在原来的终端窗口按 Control+C，再双击启动脚本启用截图识别。\n'
    exit 1
  fi
  open_page
  exit 0
fi

if ! command -v npm >/dev/null || ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 22 && minor >= 12 ? 0 : 1)' 2>/dev/null; then
  printf '请先安装 Node.js 22（至少 22.12），再双击启动。\n' >&2
  exit 1
fi

if [[ ! -x node_modules/.bin/vite || ! -x node_modules/.bin/tsc ]]; then
  printf '正在安装项目依赖…\n'
  npm ci --include=dev --no-audit --no-fund || exit 1
fi

printf '正在构建推演器…\n'
npm run build || exit 1

node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 47831 --strictPort &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null; wait "$server_pid" 2>/dev/null' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

for ((attempt = 0; attempt < 100; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    printf '推演器服务启动失败，请检查上方错误。\n' >&2
    exit 1
  fi
  if is_ready; then
    open_page
    printf '请保留此窗口。按 Control+C 可停止服务。\n'
    wait "$server_pid"
    exit $?
  fi
  sleep 0.2
done

printf '推演器服务启动超时。\n' >&2
exit 1
