# Phase 1 — 실행과 파일 저장

UI 없이 실행 엔진만 완성한다.

**완료 조건:** 하나의 Prompt를 두 Agent에 전달하여 각각의 원본 결과를 작업 폴더에 파일로 저장할 수 있다.

**체크리스트**

- [x] 작업 폴더 레이아웃 확정 — `src/lib/store/paths.ts`, `types.ts`
- [x] AgentAdapter Interface 정의 — `src/lib/agents/types.ts`
- [x] Claude Adapter 구현 — `src/lib/agents/claude.ts`
- [x] Codex Adapter 구현 — `src/lib/agents/codex.ts`
- [x] Mock Adapter 구현 — `src/lib/agents/mock.ts` (id별 고정 응답을 반환하는 factory)
- [x] Agent 병렬 실행 — `src/lib/orchestrator/runner.ts`의 `runAgents()`
- [x] Timeout / Error 처리 — `runner.ts` (AbortController + 프로세스 그룹 kill), `src/lib/agents/spawn.ts`
- [x] 결과 파일 저장 — `src/lib/store/write.ts` (원자적 쓰기 + status.json 병합)

2026-09-21에 `pnpm smoke`(정상 실행)와 별도 임시 스크립트(실패 격리 양방향, 타임아웃, 원자적 쓰기 폴링, SIGINT 종료, Mock 3-Agent)로 아래 검증 항목을 모두 통과했다.

---

## 1. 작업 폴더 레이아웃

**이 레이아웃이 이 프로젝트의 데이터 모델 전부다.** 스키마도 마이그레이션도 없다.

```
.data/tasks/
└── 20260920-140311/                    ← 폴더 이름이 곧 taskId (한글 제목이라 슬러그 없음)
    ├── task.json                       요청 메타데이터
    ├── prompt.md                       조립된 공통 프롬프트 (두 Agent가 받은 그 내용)
    ├── claude/
    │   ├── status.json                 최신 attempt 번호와 attempt별 실행 상태
    │   └── attempt-1/
    │       ├── result.md               정규화된 결과 본문 (성공 시)
    │       └── error.txt               stdout + stderr 전문 (실패 시)
    └── codex/
        ├── status.json
        └── attempt-1/
            └── ...
```

### taskId

`YYYYMMDD-HHMMSS-<제목-슬러그>` 형식이다. 세 가지가 한 번에 풀린다.

- **정렬이 공짜다.** 폴더 이름을 역순 정렬하면 최신순 목록이 된다. 인덱스도 정렬 키도 필요 없다
- **영문 제목이면 Finder에서 알아볼 수 있다.** 아래 한계 참고

슬러그는 영문/숫자/하이픈만 남기고 32자에서 자른다. **한글 제목이면 슬러그가 비어 타임스탬프만 남는다.** 한국어로 요청을 쓰는 게 기본이므로 실제로는 대부분의 폴더가 `20260920-140311` 형태가 된다. 위의 두 번째 이점(Finder에서 알아보기)은 영문 제목일 때만 얻는 덤으로 본다. 제목 원문은 언제나 `task.json`에 있고, 웹 목록은 그걸 읽어 보여준다.

같은 초에 두 번 제출되면 뒤에 `-2`를 붙인다. **존재 확인 후 생성이 아니라 `fs.mkdirSync(path, { recursive: false })`의 실패를 충돌 신호로 쓴다.** 확인과 생성 사이의 경쟁이 공짜로 없어진다.

### task.json

```json
{
  "id": "20260920-140311",
  "title": "PRD 템플릿 제안",
  "request": "사용자가 입력한 요청 내용",
  "context": "추가 Context (없으면 null)",
  "agents": ["claude", "codex"],
  "createdAt": "2026-09-20T14:03:11.000Z"
}
```

Task 전체 상태는 **여기 저장하지 않는다.** 두 `status.json`을 읽어 그때그때 계산한다. 두 군데에 상태를 두면 어긋날 수 있고, 계산 비용은 파일 두 개 읽기다.

### status.json

```json
{
  "agent": "claude",
  "latestAttempt": 1,
  "attempts": [
    {
      "attempt": 1,
      "status": "completed",
      "startedAt": "2026-09-20T14:03:11.100Z",
      "completedAt": "2026-09-20T14:03:53.400Z",
      "executionTimeMs": 42300,
      "exitCode": 0
    }
  ]
}
```

`status`는 `queued` `running` `completed` `failed` `timeout` 다섯 가지다. 취소 기능이 없으므로 `cancelled`는 없다.

`queued`는 Runner가 폴더를 만든 직후부터 Adapter를 호출하기까지의 아주 짧은 구간이라 **화면에서 관측되지 않을 가능성이 높다.** 상태로는 남겨 두되, 검수에서 "`Queued`를 눈으로 봐야 한다"고 요구하지 않는다.

**쓰기는 항상 원자적으로 한다.** 같은 디렉터리에 임시 파일로 쓰고 `fs.renameSync`로 교체한다. 웹 페이지가 1초마다 이 파일을 읽으므로, 그냥 쓰면 절반만 쓰인 JSON을 읽어 파싱이 깨지는 순간이 생긴다. 같은 파일시스템 안의 rename은 원자적이라 읽는 쪽은 항상 완결된 JSON을 본다.

### 파일 쓰기 순서

개별 파일이 원자적인 것과 **파일 사이의 순서**는 다른 문제다. 순서를 정해두지 않으면, `status.json`을 `completed`로 먼저 쓴 직후 폴링한 화면이 "완료인데 `result.md`가 없는" 상태를 읽는다.

**`status.json`을 항상 마지막에 쓴다.**

| 순서 | 성공 | 실패 |
|---|---|---|
| 1 | `result.md` | `error.txt` |
| 2 | `status.json` → `completed` | `status.json` → `failed` / `timeout` |

`status.json`이 종료 상태라는 건 **결과 파일이 이미 자리에 있다는 뜻**이 된다. 읽는 쪽은 이 순서를 믿되, 그래도 `completed`인데 `result.md`가 없으면 **그 폴링 회차를 버리고 다음 회차를 기다린다.** 파일시스템이나 에디터가 중간에 끼어든 경우를 위한 안전장치다.

### 재실행과 원본 보존

재실행은 `attempt-2/` 폴더를 새로 만든다. **기존 폴더는 건드리지 않는다.** 원칙 4(Result Preservation)가 이 한 줄로 끝난다.

**재실행은 저장된 `prompt.md`를 그대로 읽어 쓴다.** `task.json`에서 다시 조립하지 않는다. `buildPrompt()`의 고정 문구가 바뀐 뒤 재실행하면 attempt-1과 attempt-2가 서로 다른 입력을 받게 되고, 그러면 두 attempt를 비교하는 것 자체가 원칙 2를 벗어난다.

화면은 기본적으로 `latestAttempt`만 보여준다. **다만 최신 attempt가 실패이고 그 이전에 성공한 attempt가 있으면, 그 성공 결과에 접근할 수 있어야 한다.** 재실행 버튼이 `completed` 상태에서도 눌리기 때문이다. 성공한 결과를 다시 돌렸다가 인증 만료나 타임아웃으로 실패하면 멀쩡한 이전 결과가 화면에서 사라진다. 파일은 남지만 "Finder로 열어라"는 원칙 4의 취지가 아니다.

`status.json`에 attempt 이력이 다 있으므로 **가장 최근의 `completed` attempt 번호**를 찾는 건 추가 저장 없이 된다. 전체 attempt 목록 조회는 여전히 만들지 않는다.

### Task 상태 계산

각 Agent의 최신 attempt 기준으로 판정한다.

- 하나라도 `queued` 또는 `running` → `running`
- 전부 `completed` → `completed`
- 일부만 `completed` → `partial_completed`
- 하나도 `completed` 없음 → `failed`

`timeout`은 판정에서 `failed`와 같게 센다. 별도 Task 상태를 만들지 않는다. Agent 단위로는 `timeout`을 그대로 보존하므로 사유는 잃지 않는다.

이 규칙은 Agent 수와 무관하게 성립한다.

### 서버 재시작

서버가 죽으면 `running`으로 남은 `status.json`이 생긴다. **부팅 시 정리하지 않는다.** 대신 읽는 쪽에서 `startedAt`이 타임아웃 한도를 넘긴 `running`을 `failed`로 간주하고 "서버 재시작으로 중단됨"으로 표시한다.

부팅 시 전체 폴더를 훑어 고쳐 쓰는 방식은 Task가 쌓일수록 기동이 느려지고, 파일을 고쳐 쓰는 경로가 하나 더 늘어난다. 읽는 쪽에서 판정하면 그 두 가지가 모두 없어진다.

---

## 2. 디렉터리 구조

```
app/src/
├── lib/
│   ├── store/
│   │   ├── paths.ts            작업 폴더 경로 계산, taskId 생성
│   │   ├── write.ts            원자적 JSON/텍스트 쓰기
│   │   └── read.ts             Task 목록 / Task 하나 / 결과 읽기
│   ├── agents/
│   │   ├── types.ts            AgentAdapter 인터페이스와 공용 타입
│   │   ├── spawn.ts            공통 CLI 실행기 (타임아웃 / 스트리밍)
│   │   ├── claude.ts           ClaudeAdapter
│   │   ├── codex.ts            CodexAdapter
│   │   ├── mock.ts             MockAdapter (개발용)
│   │   └── registry.ts         id → Adapter 매핑, healthCheck 집계
│   └── orchestrator/
│       ├── prompt.ts           buildPrompt()
│       └── runner.ts           병렬 실행 / 상태 파일 갱신 / 결과 저장
└── app/api/                    Phase 2에서 작성
```

향후 Gemini는 `lib/agents/gemini.ts` 한 파일을 추가하고 registry에 등록하는 것으로 들어온다.

---

## 3. Adapter 계층

`lib/agents/types.ts`:

```ts
export type AgentId = 'claude' | 'codex' | 'mock'   // 향후 'gemini' 추가

export interface AgentRunInput {
  prompt: string       // buildPrompt() 결과. 모든 Agent가 동일한 값을 받는다
  workdir: string      // 격리된 빈 디렉터리
  signal: AbortSignal  // 타임아웃용
}

export interface AgentRunOutput {
  content: string      // normalizeResult() 통과 후의 본문
  raw: string          // 가공 전 stdout 전문
  stderr: string
  exitCode: number
}

export interface AgentHealth {
  ok: boolean
  version?: string
  reason?: string
}

export interface AgentAdapter {
  id: AgentId
  healthCheck(): Promise<AgentHealth>
  run(input: AgentRunInput): Promise<AgentRunOutput>
  normalizeResult(raw: string): string
}
```

노션 5장의 `cancel(task)`는 두지 않는다. 취소 기능이 V1에 없고, 타임아웃 종료는 `AbortSignal`로 충분하다.

### Agent 수를 하드코딩하지 않는다

V1은 Agent가 둘이지만 Gemini 추가가 예정되어 있으므로, **사용 가능한 Agent 목록은 항상 registry에서 읽는다.**

- 상수 배열이나 리터럴 유니온을 여러 곳에 복제하지 않는다. `AgentId`와 registry 한 군데만 고친다
- 반복은 `for (const adapter of registry.enabled())` 형태로 쓴다
- 결과를 `{ claude, codex }` 같은 고정 키 객체가 아니라 배열 또는 Map으로 다룬다
- Task 상태 판정을 "둘 다 성공"이 아니라 "전부 성공"으로 쓴다

**예외는 diff view 하나다.** 두 결과를 나란히 놓는 화면이라 구조상 2개를 전제한다. 이건 의도한 것이고 [02-phase2-web-ui.md](02-phase2-web-ui.md)에 적어 두었다.

### 공통 실행기 `spawn.ts`

- `child_process.spawn`으로 실행하고 셸을 거치지 않는다 (`shell: false`)
- **프롬프트는 인자가 아니라 stdin으로 넘긴다.** 긴 프롬프트의 인자 길이 제한과 셸 이스케이프 문제를 한 번에 피한다. 쓰기 후 stdin을 닫는다
- stdout과 stderr를 각각 누적한다
- 타임아웃(`AGENT_TIMEOUT_MS`)에 도달하면 `SIGTERM`, `AGENT_KILL_GRACE_MS` 후에도 살아 있으면 `SIGKILL`. 상태는 `timeout`
- **종료는 프로세스 그룹 단위로 한다.** `detached: true`로 띄우고 `process.kill(-child.pid, ...)`로 보낸다. Codex는 자식 프로세스를 띄울 수 있어 부모만 죽이면 손자가 남는다
- `cwd`는 호출자가 준 격리 디렉터리를 쓴다

### 실행 디렉터리 격리

**각 실행의 `cwd`는 레포 밖의 임시 디렉터리로 둔다.**

```
os.tmpdir()/multi-orchestrator/<taskId>/<agent>/attempt-<n>/
```

실행 직전에 만들고 종료 후 지운다. **결과 파일은 여기가 아니라 `.data/tasks/...` 아래 attempt 폴더에 쓴다.** 실행 위치와 저장 위치를 분리하는 것이다.

#### 왜 작업 폴더를 cwd로 쓰지 않는가

작업 폴더(`.data/`)는 `app/` 안이고 `app/`은 레포 안이다. 거기서 CLI를 실행하면 격리가 되지 않는다.

- **Claude는 `CLAUDE.md`를 cwd에서 상위로 올라가며 찾는다.** `app/CLAUDE.md`, `multi/CLAUDE.md`가 그대로 들어온다. `--tools ""`는 도구만 끄지 파일 탐색을 막지 않는다
- **Codex는 cwd에서 git 루트를 위로 찾아 워크스페이스로 잡는다.** read-only 샌드박스의 읽기 범위가 프로젝트 전체가 되고, `--skip-git-repo-check`도 필요 없어진다

두 CLI가 끌어들이는 범위가 서로 다르므로 **원칙 2(Same Input)가 깨져 비교 자체가 성립하지 않는다.** 임시 디렉터리로 옮기면 위로 올라가도 프로젝트 파일이 없고 git 저장소도 없다. Codex의 `--skip-git-repo-check`는 이 전제에서 비로소 필요해진다.

#### 남는 한계

**`~/.claude/CLAUDE.md`는 cwd와 무관하게 로드된다.** 막을 방법은 `--bare`뿐인데 이 환경에서는 인증이 깨져 쓸 수 없다([00-prerequisites.md](00-prerequisites.md) 참고).

받아들이는 이유는 성격이 다르기 때문이다. 이 파일은 모든 실행에 동일하게 적용되므로 **실행마다 달라지지 않고, Agent 사이에 비대칭을 만들지도 않는다.** 원칙 2가 요구하는 건 "모든 Agent가 같은 요청을 받는 것"이지 "provider의 기본 설정이 서로 같은 것"이 아니다. Codex 쪽 대응물(`$CODEX_HOME/config.toml`)은 `--ignore-user-config`로 끈다.

Codex는 기본적으로 파일을 쓰고 명령을 실행하려 들기 때문에 `-s read-only`를 함께 걸어 샌드박스 쪽에서도 막는다. 임시 디렉터리를 종료 후 지우므로 뭔가 썼더라도 남지 않는다.

### Adapter별 구현

[00-prerequisites.md](00-prerequisites.md)에서 두 CLI 모두 확인을 마쳤다. 아래 값을 그대로 쓴다.

| Adapter | 실행 형태 |
|---|---|
| Claude | `claude -p --tools "" --output-format text --model <고정값>`, 프롬프트는 stdin |
| Codex | `codex exec - -s read-only --skip-git-repo-check --color never --ephemeral --ignore-user-config -m <고정값>`, 프롬프트는 stdin |
| Mock | 프로세스를 띄우지 않고 고정 마크다운을 지연과 함께 돌려준다 |

**두 Adapter 모두 모델을 명시적으로 고정한다.** 안 하면 CLI 업데이트나 로컬 설정 변경에 따라 결과를 만든 모델이 조용히 바뀐다. Codex는 `--ignore-user-config` 유무만으로도 기본 모델이 달라지는 것을 실제로 확인했다.

`--skip-git-repo-check`를 빼면 임시 디렉터리에서 Codex 실행이 거부된다. `--bare` 분기는 두지 않는다. 확정 사항이고 근거는 [00-prerequisites.md](00-prerequisites.md)에 있다.

`normalizeResult()`는 앞뒤 공백만 제거한다. Phase 0에서 두 CLI 모두 stdout에 본문만 낸다는 걸 확인했으므로 로그 제거 규칙은 만들지 않는다. **본문을 임의로 요약하거나 재구성하지 않는다.** 원칙 4에 어긋난다.

### MockAdapter를 만드는 이유

Phase 2의 UI 작업 중 실제 호출 비용과 대기 시간 없이 전체 흐름을 돌릴 수 있다. `AGENT_USE_MOCK=1` 환경 변수로 registry가 모든 Adapter를 Mock으로 바꿔치기하게 한다.

Mock은 **서로 다른 두 개 이상의 고정 응답**을 준비한다. 모든 Mock이 같은 텍스트를 내면 diff view 검증이 무의미해진다. **한쪽에만 있는 섹션과 양쪽에 다 있는 섹션**을 모두 포함시킨다. 섹션 비교표의 두 경우를 한 번에 확인할 수 있다.

---

## 4. 프롬프트 구성

노션 6장의 4단 구조를 `lib/orchestrator/prompt.ts` 하나에서 조립한다.

```
1. Base Instruction    고정 문구. 독립적으로 제안하라는 지시와 출력 형식 요구
2. User Request        사용자가 입력한 요청 내용
3. Shared Context      사용자가 입력한 추가 Context (없으면 절 자체를 생략)
4. Output Requirements 고정 문구. 마크다운으로, 전체 문서를 한 번에
```

조립된 전문을 `prompt.md`에 저장한다. 모든 Agent가 **바이트 단위로 동일한 입력**을 받았음을 사후에 증명할 수 있어야 한다. Provider별 차이는 Adapter의 CLI 플래그로만 흡수하고 프롬프트 본문은 절대 건드리지 않는다.

Base Instruction에는 "다른 Agent의 결과를 참고하지 말라"는 문구를 넣지 않는다. 애초에 전달되지 않으므로 불필요하고, 존재하지 않는 맥락을 암시해 출력을 오염시킬 수 있다. 같은 이유로 Agent 이름이나 Agent 수를 프롬프트에 넣지 않는다.

**Output Requirements에 마크다운 헤딩을 쓰라는 요구를 명시한다.** Phase 2의 diff view가 섹션 단위로 읽히려면 두 결과가 모두 헤딩으로 구조화되어 있어야 한다. 구조를 강제하는 게 아니라 마크다운으로 쓰라는 수준이다. 섹션 이름과 개수는 Agent가 정한다.

---

## 5. Runner

`lib/orchestrator/runner.ts`가 Router + Execution Manager 역할만 한다. LLM 답변을 만들지 않는다.

### 실행 흐름

1. 요청을 검증한다 (**요청 내용**이 비어 있지 않음, Agent가 1개 이상 선택됨). **제목은 선택 항목이다.** 비면 `task.json`의 `title`을 `null`로 두고, 목록 화면이 요청 내용 앞부분을 제목 자리에 쓴다
2. `taskId`를 만들고 작업 폴더를 생성한다
3. `buildPrompt()`로 공통 프롬프트를 만들어 `prompt.md`와 `task.json`을 쓴다
4. Agent마다 `status.json`을 `queued`로 쓰고 attempt 폴더를 만든다
5. 각 Agent의 Adapter를 **동시에** 호출한다
6. 각 실행이 끝날 때마다 결과 파일과 `status.json`을 쓴다. 다른 실행을 기다리지 않는다

### 성공·실패 판정

Phase 0에서 확인한 두 가지를 그대로 규칙으로 못 박는다. Adapter마다 다르게 판단하지 않는다.

- **판정은 종료 코드 하나로 한다.** `exitCode === 0`이면 성공, 아니면 실패다. stderr가 비어 있는지는 보지 않는다. Codex는 성공했을 때도 stderr에 배너를 찍는다
- **실패한 실행은 `result.md`를 쓰지 않는다.** Claude는 인증 실패 메시지를 stdout에 찍고 종료 코드 1로 끝난다. 이걸 그대로 저장하면 에러 문구가 Agent 결과 파일이 된다. 실패 시에는 stdout과 stderr를 합쳐 `error.txt`에만 쓴다
- **성공 시 `result.md` 하나만 쓴다.** `normalizeResult()`가 앞뒤 공백만 제거하므로 가공 전 stdout을 따로 보관해봤자 정의상 같은 파일이 한 벌 더 쌓일 뿐이다. 원본성 검증은 스모크 스크립트가 메모리에서 대조하는 편이 실효가 있다

### 에러 격리

각 Adapter 호출을 개별적으로 감싼다. `Promise.all`은 첫 실패에서 즉시 reject되므로 쓰지 않는다. `Promise.allSettled`를 쓰거나, 각 실행을 자체적으로 try/catch하는 독립 async 함수로 감싼다.

**한 Agent의 실패가 다른 Agent의 실행에 어떤 영향도 주어서는 안 된다.** Phase 1에서 가장 틀리기 쉬운 부분이다. Agent가 둘뿐이라 한쪽이 실패하면 나머지 하나만 남는데, 이때 결과가 하나라도 정상적으로 저장되고 Task가 `partial_completed`가 되어야 한다.

### 실행 중 프로세스 레지스트리

타임아웃 종료와 중복 실행 방지를 위해 진행 중인 실행을 메모리에 들고 있는다.

```ts
const running = new Map<string, AbortController>()  // `${taskId}/${agent}` → controller
```

`globalThis`에 캐시해 dev 리로드를 넘긴다. **같은 Agent가 이미 `running`이면 재실행 요청을 거절한다.** 이 레지스트리가 메모리에 있어야 한다는 점이 단일 장수명 Node 프로세스 전제의 근거다.

**엔트리는 자식의 `exit` 이벤트에서만 지운다.** `SIGTERM`을 보낸 직후에 지우면 안 된다. `AGENT_KILL_GRACE_MS`(5초) 동안 구 프로세스가 아직 살아 있는데 재실행이 시작되고, 뒤늦게 죽은 구 프로세스의 종료 처리가 `status.json`을 덮어쓰면서 `latestAttempt`를 되돌려 쓴다.

**서버 종료 시 `running`의 프로세스 그룹을 전부 정리한다.** `detached: true`로 띄운 자식은 dev 서버를 Ctrl-C해도 살아남는다. `SIGINT` / `SIGTERM` 핸들러를 걸어 남은 그룹을 kill하지 않으면 재시작할 때마다 고아 CLI 프로세스가 쌓이고 계속 토큰을 태운다.

---

## 6. 검증

UI가 없으므로 스크립트로 확인한다. `app/scripts/smoke.ts`를 만들어 Runner를 직접 호출한다.

```bash
cd /Users/sangjeongkim/claude/multi/app && pnpm tsx scripts/smoke.ts
```

요청은 대표 사용 사례 3번을 쓴다. 구현 계획서 템플릿을 제안하라는 요청이다.

### 확인 항목

- [x] 두 Agent가 **동시에** 시작한다. `status.json`의 `startedAt` 간격이 수 초 이내여야 한다 — 실측 2ms
- [x] `.data/tasks/<taskId>/{claude,codex}/attempt-1/result.md` 두 파일이 생기고 내용이 서로 다르다
- [x] **스모크 스크립트가 Adapter에 넘긴 프롬프트 문자열과 `prompt.md` 내용의 해시가 일치한다.** 파일 존재만 확인해서는 "두 Agent가 이걸 받았다"를 검증할 수 없다
- [x] **스모크 스크립트가 CLI stdout 원문과 `result.md`를 메모리에서 대조해 앞뒤 공백 외에 동일하다** — `runner.ts`에 검증용 `onOutput` 훅을 추가해 확인
- [x] Task 상태 계산 결과가 `completed`다
- [x] **실행 cwd가 레포 밖 임시 디렉터리였다.** 로그에 찍힌 cwd 경로가 `/Users/sangjeongkim/claude/multi` 아래가 아니어야 한다 — `os.tmpdir()/multi-orchestrator/...`
- [x] **임시 디렉터리가 실행 후 삭제되었다**
- [x] 레포 안의 파일이 하나도 바뀌지 않았다. `git status`로 확인한다
- [x] **두 결과 어디에도 이 프로젝트의 내용이 섞여 있지 않다.** cwd 격리가 실제로 먹었는지 보는 것이다. 계획 문서나 소스 구조를 언급하면 격리가 깨진 것이다

### 실패 격리 검증

`.env.local`의 `CODEX_CLI_PATH`를 존재하지 않는 경로로 바꾸고 다시 실행한다.

```
CODEX_CLI_PATH=/nonexistent/codex
```

- [x] Codex만 `failed`가 되고 `error.txt`에 사유가 남는다 — `exitCode: -1`, spawn ENOENT 메시지
- [x] Codex 쪽에 `result.md`가 **생기지 않는다**
- [x] `error.txt`가 `status.json`보다 **먼저** 쓰였다 (쓰기 순서 규칙)
- [x] Claude는 정상적으로 `completed`가 되고 `result.md`가 저장된다
- [x] Task 상태 계산 결과가 `partial_completed`다

반대로 `CLAUDE_CLI_PATH`를 깨뜨려 한 번 더 확인한다. 한쪽만 검증하면 우연히 순서 의존성에 기대고 있는 코드를 놓친다.

- [x] `CLAUDE_CLI_PATH`를 깨뜨린 반대 방향도 동일하게 확인 — Claude만 `failed`, Codex는 `completed`, Task는 `partial_completed`

### 타임아웃 검증

`AGENT_TIMEOUT_MS`를 `3000` 정도로 낮추고 실행한다.

- [x] `status.json`의 상태가 `timeout`이 된다 — 두 Agent 모두 `executionTimeMs` 약 3~3.5초에서 확인
- [x] 자식 프로세스가 실제로 종료된다 (`ps`로 잔류 프로세스 없음 확인)

### 서버 종료 검증

실행 중에 dev 서버를 Ctrl-C로 끈다.

- [x] 자식 CLI 프로세스가 함께 종료된다. `ps aux | grep -E "claude|codex"`로 고아 프로세스가 없음을 확인한다 — `hookShutdown()`이 등록한 `SIGINT` 핸들러가 진행 중인 모든 `AbortController`를 abort시켜 실행 중이던 CLI를 즉시 종료시킴을 확인 (`runner.ts`)

### 원자적 쓰기 검증

실행 중에 `status.json`을 1초 간격으로 반복해서 읽는다.

```bash
while true; do cat .data/tasks/<taskId>/claude/status.json | python3 -m json.tool > /dev/null || echo BROKEN; sleep 0.1; done
```

- [x] `BROKEN`이 한 번도 찍히지 않는다. 절반만 쓰인 JSON을 읽는 순간이 없어야 한다 — 0.1초 간격으로 30초간 폴링, `BROKEN_TOTAL=0`

### Agent 수 비의존성 검증

Mock Adapter를 registry에 세 번째 Agent로 잠시 등록하고 실행한다.

- [x] 실행, 상태 계산, 파일 저장 어느 것도 고치지 않고 3개가 동작한다 — `runAgents()`가 registry를 전혀 참조하지 않으므로, id `'claude' | 'codex' | 'mock'` 세 개의 Mock Adapter를 직접 넘겨 실행 → 셋 다 `completed`, Task 상태 `completed`

여기서 고칠 곳이 나오면 그 자리가 Agent 수를 하드코딩한 지점이다. Gemini 추가 시 똑같이 걸릴 곳이므로 지금 고친다. (diff view는 예외다. Phase 2 참고)

다음: [02-phase2-web-ui.md](02-phase2-web-ui.md)
