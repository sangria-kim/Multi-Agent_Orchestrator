# Phase 0 — 사전 준비

두 CLI의 비대화형 호출 방식을 확정해야 Phase 1의 Adapter를 작성할 수 있다.

**완료 조건:** `claude`와 `codex`가 각각 터미널에서 프롬프트 하나를 비대화형으로 처리해 stdout으로 결과를 낸다. 그리고 빈 Next.js 프로젝트가 기동된다.

---

## 1. 현재 환경

2026-09-20 기준 확인 결과다.

| 도구 | 상태 | 비고 |
|---|---|---|
| `claude` | 2.1.109 | `/Users/sangjeongkim/.local/bin/claude`. **인증 재확인 필요 — 아래 참고** |
| `codex` | 0.155.1 | 설치 완료. 비대화형 실행 확인 완료 |
| `gemini` | 0.60.0 설치됨, **로그인 불가** | V1 제외. [README.md](README.md) 참고 |
| `node` | v24.15.0 | 충분 |
| `pnpm` | 10.33.1 | 패키지 매니저로 사용 |
| API 키 환경변수 | 없음 | 두 CLI 모두 자체 인증 사용 |

작업 폴더 `/Users/sangjeongkim/claude/multi`에는 `plan/` 폴더만 있고 git 저장소가 아니다.

Codex를 추가로 설치해야 한다면 npm으로 한다. Homebrew cask는 현재 정의가 깨져 있어 설치가 실패한다.

```bash
npm install -g @openai/codex
```

### Claude 인증 — 착수 전에 먼저 푼다

비대화형 실행을 확인하다가 `OAuth access token has expired. Re-authenticate to continue.` 401을 받았다. **Gemini와 같은 종류의 블로커이므로 Phase 0의 첫 작업으로 처리한다.**

```bash
claude auth
```

재로그인 후 아래 Claude 확인 명령이 통과하는지 다시 본다. 이걸 넘기고 Phase 1로 가면 Adapter 버그와 인증 실패를 구분하지 못한다.

---

## 2. 비대화형 호출 방식

아래 두 표는 `--help`를 읽고 실제 실행까지 마친 확인값이다. 이 표가 Phase 1 Adapter 구현의 입력이 된다. **CLI 버전이 올라갔다면 추측으로 고치지 말고 `--help`를 다시 읽는다.** 두 CLI 모두 플래그가 자주 바뀐다.

### Claude

| 항목 | 값 |
|---|---|
| 비대화형 플래그 | `-p` / `--print` |
| 프롬프트 전달 | stdin (파이프) |
| 출력 형식 | `--output-format text` (기본값) |
| 도구 비활성화 | `--tools ""` |
| 모델 지정 | `--model <alias 또는 full name>` |
| 종료 코드 | 성공 0, 실패 비0 |

```bash
echo "Say hello in one sentence." | claude -p --tools "" --output-format text
```

**`--bare`는 쓰지 않는다. 확정이다.** hooks, 플러그인, `CLAUDE.md` 자동 탐색을 모두 건너뛰어 재현성 측면에서는 이상적이지만, **인증을 `ANTHROPIC_API_KEY` 또는 `apiKeyHelper`로만 처리하고 OAuth와 키체인을 읽지 않는다.** 이 환경에는 API 키가 없고 구독 로그인만 쓰므로 `--bare`를 켜면 곧바로 인증 실패한다.

환경에 따라 명령줄이 갈리면 같은 요청도 실행 환경별로 다른 결과가 나온다. Adapter는 `--bare` 분기를 두지 않는다. 대신 격리는 **실행 cwd를 레포 밖으로 빼는 것**으로 얻는다. 아래 "실행 격리의 실제 범위"를 참고한다.

**`--setting-sources ""`는 쓰지 않는다.** 가벼운 격리 수단으로 보이지만 실제로 넣고 실행하니 인증까지 깨져 401이 났다.

### 실행 격리의 실제 범위

**`--tools ""`는 도구만 끄지 파일 탐색을 막지 않는다.** Claude는 `CLAUDE.md`를 cwd에서 **상위 디렉터리로 올라가며** 찾는다. 실행 cwd가 이 프로젝트 안에 있으면 `app/CLAUDE.md`, `multi/CLAUDE.md`가 그대로 컨텍스트로 들어온다. Codex도 cwd에서 git 루트를 위로 찾아 워크스페이스로 잡는다.

그래서 **실행 cwd는 레포 밖의 임시 디렉터리로 둔다.** 작업 폴더(`.data/`) 안도 아니다. `.data/`는 `app/` 안이라 결국 레포 안이기 때문이다. 자세한 규칙은 [01-phase1-execution.md](01-phase1-execution.md)의 실행 디렉터리 격리 절에 있다.

cwd를 옮겨도 남는 게 하나 있다. **`~/.claude/CLAUDE.md`는 cwd와 무관하게 로드된다.** 이건 막을 수 없다(`--bare`가 유일한 수단인데 위 이유로 못 쓴다). 다만 이 파일은 모든 실행에서 동일하게 적용되므로 Agent 간 비대칭을 만들지 않고, 프로젝트 파일처럼 실행마다 달라지지도 않는다. **원칙 2가 요구하는 건 "모든 Agent가 같은 입력을 받는 것"이지 "provider의 기본 설정이 서로 같은 것"이 아니다.** 프로젝트 파일이 끌려 들어오는 문제와는 성격이 다르므로 한계로 기록만 하고 넘어간다.

### Codex

`codex --help`, `codex exec --help`로 확인하고 실제 실행까지 마쳤다.

| 항목 | 값 |
|---|---|
| 비대화형 서브커맨드 | `codex exec` |
| 프롬프트 전달 방식 | 인자 자리에 `-` 를 주면 stdin에서 읽는다 |
| 출력 형식 | 기본값(사람이 읽는 텍스트). `--color never`로 ANSI 제거 |
| 샌드박스 플래그 | `-s read-only`. 이 모드에서는 승인 요청이 발생하지 않는다 (`approval: never`) |
| 모델 지정 플래그 | `-m` / `--model`. **명시적으로 고정한다 — 아래 참고** |
| 종료 코드 | 성공 0 |

```bash
echo "Reply with exactly: PONG" | codex exec - -s read-only --skip-git-repo-check --color never
```

**`--skip-git-repo-check`가 없으면 git 저장소가 아닌 디렉터리에서 실행이 거부된다.** Phase 1은 각 실행의 `cwd`를 작업 폴더 안의 빈 디렉터리로 두므로 이 플래그가 필수다. 빼먹으면 Codex가 매번 실패한다.

재현성을 위해 함께 걸 플래그가 둘 더 있다.

| 플래그 | 효과 |
|---|---|
| `--ephemeral` | 세션 파일을 디스크에 남기지 않는다. 실행마다 `~/.codex`가 불어나지 않는다 |
| `--ignore-user-config` | `$CODEX_HOME/config.toml`을 읽지 않는다. 로컬 설정이 결과에 섞이지 않아 원칙 2(Same Input)에 맞는다 |

**`--ignore-user-config`는 기본 모델도 함께 바꾼다.** 실제로 확인했다. 이 플래그 없이 돌리면 사용자 config의 모델(`gpt-5.6-sol`)이, 붙이면 Codex 내장 기본값(`gpt-6-astra`)이 쓰였다. 어느 쪽이 쓰였는지 stderr 배너의 `model:` 줄에 찍힌다.

그래서 **`-m`으로 모델을 명시적으로 고정한다.** 안 하면 config를 손대거나 Codex를 업데이트할 때마다 결과를 만든 모델이 조용히 바뀌고, 두 결과를 비교한 근거가 흔들린다. Claude도 같은 이유로 `--model`을 고정한다.

### 고정 모델 (확정)

| Agent | 모델 | Effort | 확인 명령 |
|---|---|---|---|
| Claude | `sonnet` | `--effort high` | `claude -p --tools "" --output-format text --model sonnet --effort high` |
| Codex | `gpt-5.6-terra` | `-c model_reasoning_effort=high` | `codex exec - -s read-only --skip-git-repo-check --color never --ephemeral --ignore-user-config -m gpt-5.6-terra -c model_reasoning_effort=high` |

Codex는 실제 실행해 stderr 배너의 `reasoning effort: high` 줄로 값이 반영됐음을 확인했다(2026-09-20).

**아래 명령줄 전체를 한 번에 실행해 확인했다. exit 0, stdout에 본문만, 임시 디렉터리에 잔여 파일 없음.**

```bash
D=$(mktemp -d) && cd "$D" && echo "Reply with exactly: PONG" | \
  codex exec - -s read-only --skip-git-repo-check --color never \
    --ephemeral --ignore-user-config
```

플래그는 하나씩이 아니라 **조합으로** 확인해야 한다. 개별로는 존재하는 플래그도 함께 쓰면 거부될 수 있고, 그러면 usage 에러로 exit 비0이 되어 모든 Codex 실행이 실패한다.

### 확인 결과 — Adapter 구현에 직접 들어가는 네 가지

**1. stdout에 결과 본문만 나온다**

Codex는 본문만 내고 버전 배너, workdir, model, session id는 전부 **stderr**로 간다. Claude도 `-p --output-format text`에서 본문만 낸다. `normalizeResult()`는 두 Adapter 모두 앞뒤 공백 제거로 충분하다.

**2. 실패 판정은 종료 코드로만 한다**

**stderr가 비어 있지 않다고 실패로 판정하면 안 된다.** Codex는 성공했을 때도 stderr에 배너를 찍는다. stderr는 실패 사유를 채우는 용도로만 모으고, 판정은 `exitCode !== 0` 하나로 한다.

**3. 실패 메시지가 stdout으로 나올 수 있다**

Claude는 인증 실패 시 `Failed to authenticate. API Error: 401 ...`을 **stdout**에 찍고 종료 코드 1로 끝난다. 종료 코드를 먼저 보지 않으면 **에러 문구가 Agent 결과 파일로 저장된다.** 종료 코드가 비0이면 `result.md`를 쓰지 않고 `error.txt`에만 남긴다.

**4. stdin과 시그널**

- 두 CLI 모두 stdin을 닫으면 정상 종료한다. 프롬프트를 쓴 뒤 반드시 stdin을 닫는다
- Codex는 자식 프로세스를 띄울 수 있으므로 종료는 프로세스 그룹 단위로 한다

---

## 3. 프로젝트 스캐폴딩

```bash
cd /Users/sangjeongkim/claude/multi && pnpm create next-app@latest app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

`plan/` 폴더와 나란히 `app/` 폴더가 생긴다.

**`create-next-app`이 `app/` 안에 자체 git 저장소를 만든다.** 최상위 git 저장소는 `/Users/sangjeongkim/claude/multi`(아래 "git 초기화" 절)에 하나만 둬야 하므로, 프로젝트 초기화 직후 `rm -rf app/.git`으로 중첩 저장소를 제거하고 나서 최상위에서 `git init`한다. 순서를 바꾸면 `app/`이 최상위 저장소에 gitlink(빈 서브모듈 참조)로 잡혀 파일이 하나도 커밋되지 않는다.

**Next.js 16.3.5는 `--no-turbopack`을 줘도 `package.json`의 `dev` 스크립트가 `next dev`로 생성되고 실제로는 Turbopack이 기본으로 켜진다** (`pnpm dev` 로그에 `Next.js 16.3.5 (Turbopack)`로 찍힌다). 이 버전에서 Webpack으로 고정하려면 스캐폴딩 이후 `dev` 스크립트를 `next dev --no-turbopack`으로 직접 고쳐야 한다. V1 범위에서는 동작에 지장이 없어 그대로 둔다.

**`create-next-app`이 `app/AGENTS.md`, `app/CLAUDE.md` 보일러플레이트를 함께 생성한다.** [실행 격리의 실제 범위](#실행-격리의-실제-범위) 절에서 설명한 `CLAUDE.md` 상위 디렉터리 자동 탐색 문제가 바로 이 파일 때문에 실재한다. Phase 1에서 Adapter 실행 cwd를 레포 밖으로 두는 설계가 이 문제를 우회하는 근거이므로, 이 파일들을 지우지 않고 그대로 둔다.

### 추가 의존성

```bash
cd /Users/sangjeongkim/claude/multi/app && pnpm add react-markdown remark-gfm && pnpm add -D tsx
```

| 패키지 | 용도 |
|---|---|
| `react-markdown` + `remark-gfm` | Agent 결과 마크다운 렌더링 (Phase 2) |
| `tsx` | Phase 1 검증 스크립트 실행 |

diff 라이브러리도 쓰지 않는다. 섹션 비교는 마크다운 헤딩을 정규식으로 뽑아 문자열로 맞춰보는 게 전부다.

DB 드라이버도 ORM도 없다. 저장은 `node:fs`로 한다. ID 생성 라이브러리도 쓰지 않는다. 작업 폴더 이름이 곧 ID이고 타임스탬프로 만든다.

### 환경 변수

`app/.env.local`:

```
ORCHESTRATOR_DATA_DIR=./.data
AGENT_TIMEOUT_MS=300000
AGENT_KILL_GRACE_MS=5000
CLAUDE_CLI_PATH=claude
CODEX_CLI_PATH=codex
```

`ORCHESTRATOR_DATA_DIR`은 상대 경로이므로 **읽는 쪽에서 `path.resolve(process.cwd(), ...)`로 한 번 절대 경로화해 모듈 상수로 고정한다.** Next의 dev / build / start는 `process.cwd()`가 같다는 보장이 없고, 실행 중에 달라지면 작업 폴더가 두 군데에 생긴다.

CLI 경로를 환경 변수로 뺀 이유는 두 가지다. 로컬마다 설치 경로가 다르고, Phase 1 검증에서 **존재하지 않는 경로를 넣어 실패를 주입**하는 데 쓴다.

`.gitignore`에 `.data/`와 `.env.local`을 추가한다.

### git 초기화

```bash
cd /Users/sangjeongkim/claude/multi && git init && git add -A && git commit -m "chore: 프로젝트 초기 구조와 구현 계획 문서"
```

---

## 완료 확인

- [ ] `claude auth`(또는 `/login`)로 재로그인하고 `claude -p`가 401/미로그인 에러 없이 응답한다 — **2026-09-20 기준 미완료.** `claude -p`가 `Not logged in · Please run /login` (exit 1)을 반환해 사용자의 수동 재로그인이 필요하다
- [x] `claude --version`, `codex --version`이 버전을 출력한다 (`claude` 2.1.109, `codex-cli` 0.155.1)
- [x] 두 CLI가 각각 비대화형으로 프롬프트 하나를 처리해 stdout으로 결과를 낸다 — Codex는 확인 완료(`PONG`, exit 0, stdout에 본문만). Claude는 로그인 완료 후 재확인 필요
- [x] **Adapter가 쓸 명령줄 전체를 그대로 한 번 실행해 exit 0을 본다.** — Codex 조합(`-s read-only --skip-git-repo-check --color never --ephemeral --ignore-user-config -m gpt-5.6-terra -c model_reasoning_effort=high`) exit 0, 임시 디렉터리에 잔여 파일 없음 확인. Claude 조합은 로그인 후 재확인 필요
- [x] 두 CLI의 고정 모델을 정해 표에 기록했다 (Claude `sonnet`+`--effort high`, Codex `gpt-5.6-terra`+`model_reasoning_effort=high`)
- [x] `pnpm dev`로 Next.js 기본 페이지가 뜬다 (`curl localhost:3000` → HTTP 200)
- [x] `.env.local`이 생성되고 `.gitignore`에 `.data/`가 있다

다음: [01-phase1-execution.md](01-phase1-execution.md)
