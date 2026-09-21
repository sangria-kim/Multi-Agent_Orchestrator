#!/usr/bin/env bash
# Multi-Agent Orchestrator 설치 스크립트 (macOS / Linux)
# git clone, ZIP 압축 해제 어느 쪽이든 동일하게 동작한다.
set -euo pipefail
cd "$(dirname "$0")"

fail() { echo; echo "✗ $1"; exit 1; }

# 1. Node 20+
command -v node >/dev/null 2>&1 || fail "Node.js가 없다. https://nodejs.org 에서 20 이상을 설치한다."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 20 이상이 필요하다 (현재 $(node -v))."
echo "✓ node $(node -v)"

# 2. pnpm (corepack 우선)
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi
command -v pnpm >/dev/null 2>&1 || fail "pnpm이 없다. 'corepack enable' 또는 'npm install -g pnpm'을 실행한다."
# 버전은 app/package.json의 packageManager가 결정한다
echo "✓ pnpm $(cd app && pnpm -v)"

# 3. Agent CLI 존재 확인 (설치는 사용자가 직접)
MISSING=0
for cli in claude codex; do
  if command -v "$cli" >/dev/null 2>&1; then
    echo "✓ $cli 확인됨"
  else
    echo "✗ $cli 없음"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  cat <<'MSG'

필요한 CLI를 설치하고 로그인한 뒤 다시 실행한다.

  npm install -g @anthropic-ai/claude-code   # 이후: claude   (로그인)
  npm install -g @openai/codex               # 이후: codex login

CLI 없이 UI만 보려면 이 스크립트를 건너뛰고:
  cd app && pnpm install && pnpm dev:mock
MSG
  exit 1
fi

# 4. .env.local (있으면 건드리지 않는다)
if [ -f app/.env.local ]; then
  echo "✓ app/.env.local 이미 있음 (유지)"
else
  cp app/.env.example app/.env.local
  echo "✓ app/.env.local 생성 (.env.example 복사)"
fi

# 5. 의존성
echo "› pnpm install ..."
(cd app && pnpm install)

cat <<'MSG'

설치 완료. 개발 서버 실행:

  cd app && pnpm dev

브라우저에서 http://localhost:3000
MSG
