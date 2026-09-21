# Multi-Agent Orchestrator 설치 스크립트 (Windows PowerShell)
# git clone, ZIP 압축 해제 어느 쪽이든 동일하게 동작한다.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Fail($msg) { Write-Host ""; Write-Host "X $msg"; exit 1 }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# 1. Node 20+
if (-not (Has 'node')) { Fail "Node.js가 없다. https://nodejs.org 에서 20 이상을 설치한다." }
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 20) { Fail "Node.js 20 이상이 필요하다 (현재 $(node -v))." }
Write-Host "OK node $(node -v)"

# 2. pnpm (corepack 우선)
if (Has 'corepack') {
  corepack enable 2>$null | Out-Null
}
if (-not (Has 'pnpm')) { Fail "pnpm이 없다. 'corepack enable' 또는 'npm install -g pnpm'을 실행한다." }
# 버전은 app/package.json의 packageManager가 결정한다
Push-Location app; $pnpmVer = (pnpm -v); Pop-Location
Write-Host "OK pnpm $pnpmVer"

# 3. Agent CLI 존재 확인 (설치는 사용자가 직접)
$missing = $false
foreach ($cli in 'claude', 'codex') {
  if (Has $cli) { Write-Host "OK $cli 확인됨" }
  else { Write-Host "X $cli 없음"; $missing = $true }
}
if ($missing) {
  Write-Host @"

필요한 CLI를 설치하고 로그인한 뒤 다시 실행한다.

  npm install -g @anthropic-ai/claude-code   # 이후: claude   (로그인)
  npm install -g @openai/codex               # 이후: codex login

CLI 없이 UI만 보려면 이 스크립트를 건너뛰고:
  cd app; pnpm install; pnpm dev:mock
"@
  exit 1
}

# 4. .env.local (있으면 건드리지 않는다)
if (Test-Path 'app/.env.local') {
  Write-Host "OK app/.env.local 이미 있음 (유지)"
} else {
  Copy-Item 'app/.env.example' 'app/.env.local'
  Write-Host "OK app/.env.local 생성 (.env.example 복사)"
}

# 5. 의존성
Write-Host "> pnpm install ..."
Push-Location app
pnpm install
Pop-Location

Write-Host @"

설치 완료. 개발 서버 실행:

  cd app; pnpm dev

브라우저에서 http://localhost:3000
"@
