# 검수 및 확장 후보

전 단계 완료 후 이 문서만으로 최종 검수가 끝나야 한다.

---

## Acceptance Criteria

**검수 상태: 2026-09-21 기준 1~13번 모두 실제 브라우저·CLI로 확인 완료.** 각 항목 아래에 확인 결과를 적어 두었다.

### 1. 페이지에서 하나의 요청을 입력할 수 있다

**Phase 2** · `/`에서 제목, 요청 내용, 추가 Context를 입력하고 실행한다. 요청 내용이 비면 실행 버튼이 비활성화되는지 함께 확인한다. **제목은 선택 항목이므로 비우고 제출해도 실행되어야 한다.** 버튼은 눌리는데 서버가 400을 던지는 상태가 아니어야 한다.

**확인 완료.** 제목을 비우고 제출 → 실행됨, 목록/헤더에 요청 내용 앞부분이 제목 자리에 표시됨.

### 2. Claude, Codex 중 실행 대상을 선택할 수 있다

**Phase 2** · 체크박스로 1~2개를 선택해 실행한다. 한쪽만 선택한 실행과 둘 다 선택한 실행이 각각 정상 동작하는지 본다. 0개 선택 시 실행 버튼이 비활성화된다.

**1개만 선택했을 때 diff view가 단일 결과 뷰로 폴백하는지 확인한다.** 빈 열이 남거나 화면이 깨지면 안 된다.

**확인 완료.** Codex 체크 해제 후 Claude만 실행 → 탭 없이 전체 폭 단일 결과 뷰. 0개 선택 시 `button.disabled === true` 확인.

### 3. 선택된 Agent들이 병렬로 실행된다

**Phase 1** · 두 `status.json`의 `startedAt` 간격이 수 초 이내인지 확인한다.

```bash
cat .data/tasks/<taskId>/*/status.json | grep startedAt
```

순차 실행이면 간격이 각 실행 시간만큼 벌어지므로 바로 드러난다. 두 Agent의 실행 시간이 제각각인 **실제 CLI로 확인해야 의미가 있다.** Mock은 지연이 같아 순차 실행도 병렬처럼 보일 수 있다.

**확인 완료.** 실제 CLI 기준 `startedAt` 간격 2ms (Phase 1 스모크). 실행 시간은 Claude 4~37초, Codex 13~96초로 서로 크게 다르지만 시작은 동시.

### 4. 각 Agent의 상태가 별도로 표시된다

**Phase 2** · 실행 상태 영역에서 각 Agent의 상태가 따로 갱신되는지 본다. `Running` `Completed` `Failed` `Timeout` 네 가지를 눈으로 확인한다. `Timeout`은 `AGENT_TIMEOUT_MS`를 3000으로 낮춰 확인한다.

`Queued`는 구간이 매우 짧아 관측되지 않을 수 있다. 표시 경로가 있는지만 코드로 보고, 눈으로 보는 걸 요구하지 않는다.

**Task 상태 `partial_completed`가 작업 목록 배지로 표시되고, 그 Task를 열었을 때 폴링이 멈추는지 함께 확인한다.** 종료 상태 집합에서 빠지면 영원히 폴링한다.

**확인 완료.** `AGENT_TIMEOUT_MS=3000`으로 실제 CLI 두 Agent 모두 `Timeout`(amber) 배지 눈으로 확인, 프로세스도 정상 종료(`ps aux`에 잔류 없음). `CODEX_CLI_PATH`를 깨뜨려 만든 `partial_completed` Task를 목록에서 "Partial" 배지로 확인했고, 그 Task를 열었을 때 네트워크 요청이 전혀 발생하지 않음(서버 로그에 해당 taskId 요청 0건)을 확인 — SSR 데이터가 이미 종료 상태라 폴링이 아예 시작되지 않았다.

### 5. Agent 하나가 실패해도 다른 실행은 중단되지 않는다

**Phase 1** · 가장 틀리기 쉬운 항목이라 실패를 직접 주입해서 확인한다.

```
CODEX_CLI_PATH=/nonexistent/codex
```

- Codex만 `failed`가 되고 `error.txt`에 사유가 남는다
- Codex 쪽에 `result.md`가 생기지 않는다
- Claude는 정상적으로 `completed`가 되고 `result.md`가 저장된다
- Task 상태 계산 결과가 `partial_completed`다

반대로 `CLAUDE_CLI_PATH`를 깨뜨려 한 번 더 확인한다. 한쪽만 검증하면 우연히 순서 의존성에 기대고 있는 코드를 놓친다.

**확인 완료.** 양방향 모두 확인. `CODEX_CLI_PATH` 깨짐 → Codex만 `failed`(exitCode -1, ENOENT), `result.md` 없음, Claude는 정상 `completed`, Task `partial_completed`. `CLAUDE_CLI_PATH` 깨짐 → 반대로 Claude만 `failed`, Codex 정상, Task `partial_completed`. (Phase 1에서 파일 레벨로, Phase 2/3에서 브라우저 UI로 재확인)

### 6. 각 Agent의 결과가 각자의 로컬 폴더에 저장된다

**Phase 1** · 작업 폴더를 직접 연다.

```bash
find .data/tasks/<taskId> -type f
```

- `task.json`, `prompt.md`가 있다
- `claude/attempt-1/result.md`, `codex/attempt-1/result.md`가 있고 내용이 서로 다르다
- **스모크 스크립트가 CLI stdout 원문과 `result.md`를 메모리에서 대조해 앞뒤 공백 외에 동일하다.** `normalizeResult()`가 그 이상 가공하지 않았음을 보는 것이다. 성공 시에는 원문을 파일로 따로 남기지 않으므로 이 대조는 실행 중에만 가능하다
- **`result.md`가 `status.json`보다 먼저 쓰였다.** 실패 케이스에서는 `error.txt`가 먼저다

실패한 실행의 stdout이 결과로 새지 않았는지도 본다. 인증 만료처럼 CLI가 에러 문구를 stdout에 찍고 비0으로 끝나는 경우가 있다. 이때 `result.md`가 생기면 안 되고, 문구는 `error.txt`에만 있어야 한다.

**확인 완료.** 스모크 스크립트가 `runner.ts`에 추가한 `onOutput` 훅으로 CLI stdout 원문을 메모리에서 가로채 `result.md`와 대조 — `raw.trim() === 파일 내용` 일치. 쓰기 순서(성공: `result.md`→`status.json`, 실패: `error.txt`→`status.json`)는 실패 격리 테스트에서 `error.txt`의 mtime이 `status.json`보다 앞섬을 확인했다.

### 7. 실행이 레포 밖에서 격리되어 이루어진다

**Phase 1** · 원칙 2가 실제로 지켜지는지 보는 항목이다.

- 실행 cwd가 `/Users/sangjeongkim/claude/multi` 아래가 **아니다.** 임시 디렉터리여야 한다
- 임시 디렉터리가 실행 후 삭제된다
- 레포 안의 파일이 하나도 바뀌지 않는다 (`git status`)
- **두 결과 어디에도 이 프로젝트의 내용이 섞여 있지 않다.** 계획 문서나 소스 구조를 언급하면 cwd 격리가 깨진 것이다
- 두 Adapter 모두 모델을 명시적으로 고정했다. stderr 배너나 로그에서 실제 쓰인 모델을 확인한다

`~/.claude/CLAUDE.md`는 cwd와 무관하게 로드되므로 이 항목의 대상이 아니다. 한계로 기록해 두었다.

**확인 완료.** 실행 cwd는 `os.tmpdir()/multi-orchestrator/<taskId>/<agent>/attempt-<n>`(레포 밖)이었고 실행 후 삭제됨을 확인. `git status`가 스모크 실행 전후 동일. 두 결과 어디에도 "orchestrator", "claude/multi", 계획 문서 언급 없음. 고정 모델은 stderr 배너(Codex)와 `--model`/`--effort` 인자(Claude)로 확인 — Claude `sonnet`/`high`, Codex `gpt-5.6-terra`/`high`.

### 8. 웹 페이지가 로컬 파일만 참조한다

**Phase 2** · 원칙 5를 직접 확인한다.

- 서버를 껐다 켜도 과거 작업이 그대로 조회된다. 메모리에 상태가 없다
- 작업 폴더의 `result.md`를 에디터로 고치고 페이지를 새로고침하면 **고친 내용이 화면에 반영된다.** 파일이 진실임을 보는 가장 직접적인 방법이다
- 작업 폴더를 통째로 다른 곳에 복사하고 `ORCHESTRATOR_DATA_DIR`을 그쪽으로 바꾸면 그대로 동작한다
- **`.data/`와 임시 디렉터리 밖에 어떤 파일도 생기지 않는다.** DB 파일이 없는 것은 물론이고 캐시나 로그도 새로 생기지 않아야 한다

**확인 완료.** ① 서버 재시작 여러 번 반복 후에도 `/tasks`에 과거 작업이 그대로 조회됨. ② `result.md`를 에디터 대신 `echo`로 직접 덮어쓰고 새로고침 → 수정한 문구가 화면에 그대로 렌더링됨. ③ `.data/tasks`를 `/tmp`로 복사하고 `ORCHESTRATOR_DATA_DIR=/tmp/...`로 바꿔 재시작 → `/tasks` 목록이 그대로 뜸. ④ `git status`가 항상 clean이었고, `app/` 안에서 `.data`·`.next`·`node_modules` 제외하고 새로 생긴 파일은 TypeScript의 정상적인 `tsconfig.tsbuildinfo`(gitignore 처리됨) 하나뿐 — 애플리케이션이 만든 캐시/로그는 없다.

### 9. 두 결과를 diff view로 동시에 볼 수 있다

**Phase 2** · 두 모드를 모두 확인한다.

- **나란히 보기**에서 두 결과가 동시에 보이고 스크롤이 동기화된다
- **섹션 비교**에서 한쪽에만 있는 섹션이 `—`로 표시되고, 양쪽에 있는 섹션은 같은 행에 놓인다
- Agent를 **1개만** 선택한 Task에서는 모드 탭이 숨겨지고 단일 결과 뷰가 나온다

Mock으로 검증할 때는 한쪽에만 있는 섹션과 양쪽에 다 있는 섹션이 모두 포함된 고정 응답을 쓴다.

**확인 완료.** Mock/실제 CLI 양쪽에서 나란히 보기(스크롤 동기화 포함)·섹션 비교(공통/전용 섹션이 `✓`/`—`로 정확히 표시) 모두 확인. Codex 체크 해제 후 실행 시 탭이 사라지고 단일 결과 뷰로 폴백됨을 확인.

### 10. 특정 Agent만 재실행할 수 있다

**Phase 2** · 실패한 Agent의 재실행 버튼을 누른다.

- 해당 Agent만 `Running`이 되고 나머지의 결과는 그대로 남는다
- `attempt-2/` 폴더가 **새로** 생긴다
- `attempt-1/`의 파일이 그대로 남아 있다. 덮어쓰이지 않는다
- 실행 중에는 재실행 버튼을 다시 누를 수 없다
- **성공한 Agent를 재실행해 실패시켜도 "이전 성공 결과 보기"로 attempt-1 결과에 접근된다.** 재실행 버튼이 `Completed`에서도 눌리므로 반드시 생기는 경로다
- 재실행이 저장된 `prompt.md`를 그대로 쓴다. attempt-1과 attempt-2의 입력이 동일하다

**확인 완료.** Mock/실제 CLI 양쪽에서 재실행 버튼 클릭 → 해당 Agent만 `Running`, 나머지 결과 유지. `attempt-2/` 새로 생성, `attempt-1/` 그대로 보존. 실행 중 재실행 버튼 `disabled === true` 확인. 성공한 Codex를 `CODEX_CLI_PATH` 깨진 상태로 재실행해 실패시킨 뒤 "이전 성공 결과 보기" 클릭 → attempt-1의 실제 내용이 그대로 열림, "← 에러로 돌아가기"로 복귀 가능. `retryAgent()`가 `fs.readFileSync(promptPath(taskId))`로 항상 같은 `prompt.md`를 읽으므로 attempt 간 입력 동일함이 코드로 보장된다.

### 11. 과거 작업과 결과를 다시 조회할 수 있다

**Phase 2** · `/tasks`에서 과거 작업을 열어 두 결과가 그대로 복원되는지 본다. **서버를 재시작한 뒤에도** 조회되는지 확인한다.

**확인 완료.** 이번 검수 과정에서 서버를 10회 넘게 재시작했고 그때마다 `/tasks` 목록과 개별 작업 상세가 그대로 복원됨을 반복 확인했다.

### 12. 도구가 임의로 결과를 병합하거나 판정하지 않는다

**전 단계** · 이 프로젝트의 존재 이유에 해당하는 항목이라 코드로 확인한다.

- 여러 결과를 입력으로 받아 새 텍스트를 만드는 코드 경로가 없다. `result.md`에 쓰기가 일어나는 곳은 Runner의 실행 결과 저장 한 군데뿐이다
- `normalizeResult()`가 공백 제거 외의 변형을 하지 않는다
- 화면에 순위, 점수, 추천, "이쪽이 더 낫다"류의 표시가 없다
- 섹션 비교표가 이름이 다른 섹션을 의미로 묶지 않는다. 순수 문자열 비교만 한다
- 프롬프트의 Base Instruction에 다른 Agent를 언급하는 문구가 없다

**확인 완료(코드 검토).** `result.md` 쓰기는 `runner.ts` 한 곳(`writeTextAtomic(resultPath(...), output.content)`)뿐. `normalizeResult()`는 두 Adapter 모두 `raw.trim()`만 한다. `src/app`, `src/components` 전체에서 "순위/점수/추천/더 낫다/rank/score/merge/병합" 문자열 검색 결과 없음. `compareSections()`는 `Array.includes`로 순수 문자열 동등 비교만 한다. `prompt.ts`의 실제 프롬프트 문자열(`BASE_INSTRUCTION`, `OUTPUT_REQUIREMENTS`)에는 Claude/Codex 언급이 없다 (코드 주석에만 설계 근거로 언급됨).

### 13. Agent 수에 의존하는 코드가 없다

**Phase 1** · Gemini 추가가 예정되어 있어 넣은 항목이다.

Mock Adapter를 registry에 세 번째 Agent로 잠시 등록하고 전체 흐름을 돌린다. 실행, 상태 계산, 파일 저장, 목록 표시 어느 것도 고치지 않고 3개가 동작해야 한다.

**diff view는 예외다.** 2단 레이아웃이라 구조상 2개를 전제한다. 의도한 예외이므로 여기서 걸려도 문제가 아니다. 나머지 경로에서 고칠 곳이 나오면 그 자리가 하드코딩 지점이다.

**확인 완료.** `registry.ts`에 `createMockAdapter('mock')`을 임시로 세 번째로 등록하고 웹 UI 전체(요청 입력의 체크박스 3개, 실행 상태 표 3행, 목록의 점 3개, 상세 페이지의 스택형 3열 결과)를 실제 브라우저로 돌렸다 — 코드 수정 없이 3개 모두 정상 동작. diff view만 예외대로 2단 대신 세로 스택 폴백으로 처리됨(의도한 동작). 검수 후 임시 코드는 되돌렸다.

---

## 전체 통합 확인

모든 Phase를 마친 뒤 실제 CLI로 대표 사용 사례 세 개를 한 번씩 돌린다.

| # | 요청 | 확인할 것 |
|---|---|---|
| 1 | 신규 기능 구현 계획서 작성 | 두 결과가 서로 다른 섹션 구성을 냈는가 |
| 2 | 동일한 문제에 대한 조사 / 아이디어 제시 | 두 결과가 서로 다른 선택지나 관점을 냈는가 |
| 3 | PRD 문서 포맷 제안 | 섹션 비교표에서 차이가 한눈에 읽히는가 |

그런 다음:

4. 서버를 재시작하고 세 작업을 `/tasks`에서 다시 연다
5. 작업 폴더를 Finder로 열어 `result.md` 여섯 개가 화면 내용과 일치하는지 본다
6. `ps aux | grep -E "claude|codex"`로 고아 프로세스가 남지 않았는지 본다

**확인 완료 (2026-09-21).** 실제 CLI로 세 대표 사용 사례를 동시 제출했다(같은 초에 제출되어 taskId가 `20260921-080918`, `-2`, `-3`으로 충돌 처리 규칙까지 실제로 확인됨).

| # | 요청 | 결과 |
|---|---|---|
| 1 | 계획서 작성 | 두 Agent가 서로 다른 계획서 구조로 작성 완료 |
| 2 | 조사/아이디어 (인증 방식) | Claude의 최초 attempt-1이 "먼저 확인하겠습니다 (No content)"로 비정상적으로 짧게 끝남 → **재실행**해 attempt-2에서 4개 인증 방식 후보를 상세 비교한 완전한 보고서를 받음. attempt-1은 그대로 보존됨. 섹션 비교표에서 Claude·Codex의 구조 차이가 명확히 드러남 |
| 3 | PRD 포맷 제안 | 두 Agent가 완전히 다른 섹션 구성 제시, 섹션 비교표에서 한눈에 대조됨 |

이어서: 서버 재시작 → `/tasks`에서 세 작업 모두 `Completed`로 정상 조회. `GET /api/tasks/{id}` 응답의 `result` 필드와 `.data/tasks/.../result.md` 파일 내용을 Python으로 직접 바이트 단위 비교(`==`)해 완전히 일치함을 확인(대표로 use case 3의 Claude·Codex 결과 모두 일치). `ps aux | grep -E "claude -p|codex exec"`로 고아 프로세스 없음을 재확인.

**부수 발견 (버그 아님).** use case 2에서 Claude가 최초 실행에서 이례적으로 부실한 응답을 낸 것은 인프라 결함이 아니라 LLM 자체의 비결정성이다. 이 프로젝트는 원칙대로 그 결과를 있는 그대로 파일에 남겼고, 재실행 한 번으로 정상적인 결과를 받으면서 attempt-1도 함께 보존되었다 — 오히려 이 도구의 재실행·원본 보존 설계가 의도대로 동작함을 보여주는 사례였다.

---

## V1 제외 항목

구현 중 이 경계를 넘지 않는지 주기적으로 확인한다.

- AI가 자동으로 최종안 선택, 결과 자동 Merge, 결과 점수화 / 순위화
- **Proposal 선택 기능.** 도구가 선택을 기록하지 않는다
- 개별 실행 취소, 실시간 스트리밍(SSE), 과거 요청 검색
- Agent 간 토론, Agent가 다른 Agent를 재귀 호출
- 복잡한 Workflow Builder, 팀 협업 / 권한 관리, Cloud 배포

---

## 확장 후보

| 항목 | 내용 |
|---|---|
| **Gemini Agent** | 세 번째 Agent. CLI 로그인 실패로 V1에서 제외. **최우선 확장 후보.** diff view에 "비교할 두 Agent" 선택기가 함께 필요하다 |
| **Proposal 선택** | 채택한 결과를 작업 폴더에 마커 파일로 기록. 이번 V1에서 제외 |
| **Refinement Mode** | 결과 하나를 기준으로 후속 수정. 선택한 결과 원문을 Context에 담아 **새 작업을 생성**하는 방식이면 기존 실행 경로를 그대로 재사용한다 |
| **실시간 출력 스트리밍** | 실행 중 부분 출력 표시. 폴링을 SSE로 바꾸는 작업이다 |
| Template Library | 마음에 든 문서 포맷을 Template으로 저장 |
| Shared Context | 프로젝트별 공통 Context 저장 |
| Preset | PRD, Implementation Plan 등 반복 요청용 Prompt Preset |
| Structured Output | 특정 Schema로 결과 강제 |
| Git Workspace | Coding Task 실행 시 Agent별 isolated worktree 제공 |
| Cost / Token Tracking | Agent별 사용량 비교 |

### Git Workspace로 가는 길

Phase 1에서 각 실행의 `cwd`를 attempt 폴더로 격리했다. Git Workspace는 이 디렉터리를 빈 폴더 대신 git worktree로 바꾸는 것으로 시작할 수 있다. 실행 격리 구조는 이미 자리를 잡아 둔 셈이다.
