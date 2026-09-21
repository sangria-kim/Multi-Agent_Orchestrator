# Multi-Agent Orchestrator

프롬프트 하나를 Claude와 Codex 두 CLI Agent에 **동일한 입력으로** 던지고, 돌아온 결과를 웹 UI에서 나란히 비교하는 오케스트레이터다. 각 실행은 작업 폴더 하나에 기록되며, Agent별 결과·에러·재시도를 따로 확인할 수 있다. Next.js(App Router) + 파일시스템 저장, DB 없음.

## 빠른 시작

**1) 소스 받기 — 둘 중 하나**

A. git clone

```bash
git clone git@github.com:sangria-kim/Multi-Agnet_Orchestrator.git && cd Multi-Agnet_Orchestrator
```

B. ZIP 다운로드 (사내망에서 git이 막힐 때)

GitHub → **Code → Download ZIP** 으로 받거나, 소스를 가진 쪽에서 아래 한 줄로 만들어 전달한다.

```bash
git archive --format=zip -o multi.zip HEAD
```

압축을 풀고 그 폴더로 이동한다. 설치 스크립트는 git을 전혀 쓰지 않으므로 clone이든 ZIP이든 동일하게 동작한다.

**2) 설치**

```bash
./install.sh
```

Windows:

```bash
powershell -ExecutionPolicy Bypass -File install.ps1
```

**3) 실행**

```bash
cd app && pnpm dev
```

브라우저에서 http://localhost:3000

### ZIP으로 받았을 때 주의

- macOS/Linux: ZIP은 실행 권한을 잃는다 → `chmod +x install.sh`, 또는 그냥 `bash install.sh`
- macOS: 브라우저로 받은 ZIP에는 격리 속성이 붙을 수 있다 → `xattr -dr com.apple.quarantine .`
- Windows: `Unblock-File .\install.ps1`
- `.env.local`은 ZIP에 들어있지 않다(gitignore 대상). 스크립트가 `app/.env.example`에서 만들어 준다
- `pnpm install`에는 네트워크가 필요하다. npm 레지스트리가 막힌 사내망이면 사내 미러를 `.npmrc`에 지정한 뒤 실행한다

## 사전 요구사항

| 항목 | 버전 | 비고 |
|---|---|---|
| Node.js | 20 이상 (개발 환경 v24) | 스크립트가 확인만 한다. 자동 설치하지 않는다 |
| pnpm | 10.33.1 | `corepack enable`로 자동 준비된다 |
| `claude` | 2.1 이상 | **로그인 필요.** `claude` 실행 후 `/login` |
| `codex` | 0.155 이상 | **로그인 필요.** `codex login` |

두 CLI 모두 각자의 OAuth 로그인을 쓴다. API 키 환경변수는 필요 없다. 설치 스크립트는 CLI의 **존재만 확인하고** 없으면 설치 명령을 안내한 뒤 멈춘다.

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
```

## 환경 변수 (`app/.env.local`)

전부 기본값이 있어 파일이 없어도 동작하지만, 값을 눈에 보이게 두기 위해 `app/.env.example`을 복사해 쓴다.

| 키 | 기본값 | 설명 |
|---|---|---|
| `ORCHESTRATOR_DATA_DIR` | `./.data` | 작업 데이터 저장 폴더 (`app/` 기준) |
| `AGENT_TIMEOUT_MS` | `300000` | Agent 실행 타임아웃 |
| `AGENT_KILL_GRACE_MS` | `5000` | 타임아웃 후 강제 종료까지의 유예 |
| `CLAUDE_CLI_PATH` | `claude` | claude CLI 경로 |
| `CODEX_CLI_PATH` | `codex` | codex CLI 경로 |

## 문제 해결

- **`Failed to authenticate. API Error: 401`** — Claude OAuth 토큰 만료다. `claude` 실행 후 `/login`으로 재로그인한다
- **Codex가 매번 실패** — `codex login` 상태와 모델 접근 권한을 확인한다. 실패 사유는 작업 폴더의 `error.txt`에 남는다
- **CLI 없이 UI만 확인** — `cd app && pnpm dev:mock` (Agent 호출을 목으로 대체)

## 문서

- 구현 계획: [`plan/`](plan/)
- 설계 결정 기록: [`DECISIONS.md`](DECISIONS.md)
