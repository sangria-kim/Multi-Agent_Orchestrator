# 설정 확장: 타임아웃 · 모델/effort

## Context

저장 위치 설정(`/settings`, `.settings.json`)은 들어갔다. 다음으로 자주 만지는 두 값이 아직 코드/env에 고정돼 있다.

- `AGENT_TIMEOUT_MS`(5분) — `src/lib/env.ts:1`. 긴 요청이 잘리는데 바꾸려면 `.env.local` + 재시작.
- 모델/effort — `src/lib/agents/claude.ts:7-8`(`sonnet`/`high`), `src/lib/agents/codex.ts:7-8`(`gpt-5.6-terra`/`high`). 비용·속도가 바로 바뀌는 값인데 하드코딩.

목표: 두 값을 `/settings`에서 바꾸고 재시작 없이 다음 실행부터 반영.

## 0. 공통 준비 — `src/lib/store/settings.ts` (신규)

지금 설정 읽기/쓰기는 `paths.ts` 안에 dataDir 전용으로 박혀 있다. 항목이 셋이 되므로 한 파일로 뺀다.

```ts
export interface Settings { dataDir?: string | null; timeoutMs?: number; models?: Record<string, { model: string; effort: string }> }
export function readSettings(): Settings   // 매 호출 파일 읽기, 실패 시 {}
export function writeSettings(patch: Partial<Settings>): Settings  // 읽고 병합해 쓰기 (항목별 PUT이 서로 지우지 않도록)
```

`paths.ts`의 `dataDirWithSource()`는 `readSettings().dataDir`를 쓰도록 바꾸고, `saveDataDir`는 제거하고 `writeSettings`로 대체한다. `SETTINGS_PATH`는 `settings.ts`로 이동.

주의: `writeSettings`는 read-merge-write라 동시 PUT에서 뒤엣것이 이긴다.
`// ponytail: read-merge-write, 설정 저장이 동시에 일어날 일이 없어 락 없음. 멀티 유저가 되면 파일 락.`

## 1. 타임아웃

### `src/lib/env.ts`
`AGENT_TIMEOUT_MS` 상수를 함수로:

```ts
export function agentTimeoutMs(): number {
  const s = readSettings().timeoutMs
  if (typeof s === 'number' && s > 0) return s
  return Number(process.env.AGENT_TIMEOUT_MS ?? 300000)
}
```
`AGENT_KILL_GRACE_MS`는 그대로 상수로 둔다(설정 대상 아님).

### 호출자 2곳 (전부)
- `src/lib/orchestrator/runner.ts:100` — `setTimeout(..., agentTimeoutMs())`. 실행 시점에 읽으므로 진행 중인 실행은 영향 없음(의도한 동작).
- `src/lib/store/read.ts:9` — `const STALE_AFTER_MS`가 모듈 상수다. 상수를 지우고 `computeAgentState` 안에서 `agentTimeoutMs() + AGENT_KILL_GRACE_MS`로 계산.

### API
`PUT /api/settings`에 `timeoutMs` 추가. 검증: 정수, `10_000 ~ 3_600_000` 범위 밖이면 400.
실행 중(`hasRunningAgents()`) 차단은 dataDir에만 적용한다 — 타임아웃은 다음 실행부터 적용이라 안전하다. 지금 코드는 무조건 409이므로, 409 조건을 `body에 dataDir이 실제로 바뀌어 들어온 경우`로 좁힌다.

### UI
`/settings`에 숫자 입력(단위: 초로 보여주고 ms로 변환) 한 칸.

## 2. 모델 / effort

### 유효값 — 추측 금지
구현 시작 전에 실제 CLI에서 확인하고 그 목록만 상수로 박는다:

```bash
claude --help | grep -A3 -- '--model\|--effort'
codex exec --help | grep -- '-m\|reasoning'
```

확인한 값만 담은 리터럴 배열을 `src/lib/agents/options.ts`에 두고, API 검증과 UI 드롭다운이 **같은 배열**을 쓴다. 자유 입력 금지(spawn 인자로 들어가는 값이라 신뢰 경계).

### 어댑터 — 플러밍 대신 자체 조회
`AgentRunInput`에 필드를 추가하면 runner·mock·타입까지 번진다. 대신 어댑터가 `run()` 호출 시점에 직접 읽는다 (이미 `process.env`를 읽고 있던 자리를 모듈 최상단 → 함수 안으로 옮기는 것뿐):

```ts
// claude.ts
async function run(input: AgentRunInput) {
  const { model, effort } = resolveAgentOptions('claude')  // settings > 기본값
  ... '--model', model, '--effort', effort ...
}
```
`codex.ts`도 동일 (`-m`, `-c model_reasoning_effort=…`). `resolveAgentOptions`는 `options.ts`에 두고 기본값은 지금 하드코딩된 값 그대로.

주의: `resolveAgentOptions`도 화이트리스트로 한 번 더 거른다 — 손으로 고친 `.settings.json`이 그대로 인자가 되면 안 된다. 목록 밖이면 기본값으로 폴백.

### API / UI
`PUT`에 `models: { claude: {model, effort}, codex: {...} }`. Agent 목록은 `registry.enabled()`에서 받고 리터럴을 복제하지 않는다(기존 규칙).
UI는 Agent별로 모델/effort `<select>` 두 개. 목록은 `GET /api/settings` 응답에 유효값 배열을 실어 보내 한 군데서 관리.

## 파일 요약

| 파일 | 변경 |
|---|---|
| `src/lib/store/settings.ts` | 신규 — read/write |
| `src/lib/agents/options.ts` | 신규 — 유효값 목록 + `resolveAgentOptions` |
| `src/lib/store/paths.ts` | settings.ts 사용으로 교체 |
| `src/lib/env.ts` | `AGENT_TIMEOUT_MS` → `agentTimeoutMs()` |
| `src/lib/orchestrator/runner.ts`, `src/lib/store/read.ts` | 호출부 2곳 |
| `src/lib/agents/{claude,codex}.ts` | 모듈 상수 → run() 안에서 조회 |
| `src/app/api/settings/route.ts` | 항목 추가, 409 조건 축소 |
| `src/app/settings/page.tsx` | 입력 추가 |
| `.env.example` | 설정 화면이 우선한다는 주석 |

## 검증

1. `pnpm exec tsc --noEmit`.
2. 타임아웃 15초로 저장 → 실제 요청 실행 → 15초 뒤 `status: timeout`, `error.txt` 생성. 서버 재시작 없이.
3. 저장 직후 `curl /api/settings`가 새 값을, `.settings.json`이 dataDir을 **잃지 않았는지** 확인(병합 검증).
4. 타임아웃 `5`(초), `0`, 문자열 → 각각 400.
5. 모델을 목록의 다른 값으로 저장 → 실행 후 `ps`/CLI 로그나 mock이 아닌 실제 실행의 `error.txt`로 해당 모델이 쓰였는지 확인. 잘못된 모델명은 API에서 400.
6. `.settings.json`을 손으로 `"model": "../evil"`로 고친 뒤 실행 → 기본값으로 폴백(인자에 그대로 안 들어감).
7. 실행 중 타임아웃 변경 → 200, dataDir 변경 → 409.
8. `pnpm smoke`.

## 생략

- kill grace, 목록 개수, 프롬프트 템플릿 — 각각 이유는 직전 대화 참고.
- Agent별 타임아웃 분리 — 하나로 충분, 갈릴 때 나눈다.
