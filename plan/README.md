# Multi-Agent Orchestrator — 구현 계획

사용자가 웹 페이지에서 하나의 요청을 입력하면 Orchestrator가 동일한 요청을 Claude와 Codex에 전달하고, 각 Agent가 독립적으로 작업한 결과를 **작업 폴더에 파일로 저장한다.** 웹 페이지는 그 파일을 읽어 두 결과를 나란히 보여준다.

원본 기획: [Multi-Agent Orchestrator 구현 계획 (Notion)](https://app.notion.com/p/3e0c9dbcdcf381deb8cac1bd70a58aea)

---

## 이 도구가 하는 일

1. 웹 페이지에서 요청을 하나 입력한다
2. Orchestrator가 **동일한 요청**을 Claude와 Codex에 동시에 전달한다
3. 각 Agent의 결과를 **각자의 로컬 폴더에 파일로 저장한다**
4. 웹 페이지에서 두 결과를 **diff view로 동시에** 본다

그게 전부다. 판단은 사용자가 한다. 도구는 두 결과를 나란히 놓기만 한다.

## 대표 사용 사례

세 가지다. 셋 다 "문서 한 편을 받는" 작업이라 파일 저장과 diff 비교가 그대로 들어맞는다.

| # | 사용 사례 | 예 |
|---|---|---|
| 1 | 특정 계획서 작성 | 신규 기능 구현 계획서를 각각 작성 |
| 2 | 동일한 문제에 대한 조사 또는 아이디어 제시 | 인증 방식 선택지를 각각 조사 |
| 3 | 사용자가 요청한 문서 포맷 제안 | PRD 템플릿 구조를 각각 제안 |

Coding Task는 대상이 아니다. 두 Agent 모두 읽기 전용에 가깝게 실행한다.

---

## 핵심 원칙

설계 판단이 갈릴 때 되돌아올 기준이다. 노션 2장을 따르되 V1 범위에 맞춰 줄였다.

| # | 원칙 | 의미 |
|---|---|---|
| 1 | Independent Proposal | 각 Agent는 다른 Agent의 결과를 보지 않고 독립 실행한다 |
| 2 | Same Input | 비교가 성립하도록 동일한 요청과 Context를 모든 Agent에 전달한다 |
| 3 | No Judgment by Tool | 도구는 병합·점수화·순위화·최종안 결정을 하지 않는다 |
| 4 | Result Preservation | 각 Agent의 원본 결과를 파일로 보존하고 덮어쓰지 않는다 |
| 5 | Files are the Source of Truth | 모든 상태와 결과는 파일에 있다. 웹 페이지는 파일을 읽을 뿐이다 |
| 6 | Provider Abstraction | Agent별 호출 방식을 Adapter 계층으로 분리한다 |

원칙 5가 이번 단순화의 핵심이다. DB가 없으므로 웹 서버를 꺼도 결과는 그대로 남고, Finder나 에디터로 직접 열어도 된다.

---

## 확정된 기술 결정

| 항목 | 결정 |
|---|---|
| 대상 Agent | **Claude, Codex 2개** (Gemini는 아래 참고) |
| Agent 호출 | CLI subprocess (`claude` / `codex` 비대화형 실행) |
| 저장소 | **파일 시스템만.** DB 없음 |
| 실행 cwd | **레포 밖 임시 디렉터리.** 결과 저장 위치와 분리한다 |
| 스택 | Next.js 단일 스택 (App Router + Route Handler + `child_process`) |
| 결과 비교 | **diff view** (나란히 보기 + 섹션 비교) |
| 상태 갱신 | 폴링. 실행 중일 때만 1초 간격으로 상태 파일을 읽는다 |

### DB를 쓰지 않는 이유

이 도구가 다루는 데이터는 "요청 하나에 결과 문서 두 편"이고, 조회 패턴은 "폴더 목록"과 "폴더 하나 열기"가 전부다. 관계형 질의가 필요한 곳이 없다. 반면 파일로 두면 얻는 게 많다.

- 결과가 마크다운 파일 그대로라 에디터·Finder·`git`·`diff` 어느 도구로도 열린다
- 스키마 마이그레이션, 커넥션 싱글턴, WAL, 부팅 시 상태 정리가 전부 사라진다
- 원칙 4(Result Preservation)가 "파일을 덮어쓰지 않는다" 한 줄로 끝난다

### 단일 스택을 택한 근거

로컬 Node는 24.15로 준비되어 있고 Python은 3.9.6이라 FastAPI를 쓰려면 3.11+ 설치가 선행된다. 백엔드가 하는 일은 CLI subprocess 실행과 파일 읽기/쓰기가 전부라 Node에서 그대로 처리된다.

### 전제

오케스트레이터는 **단일 장수명 Node 프로세스**에서 동작한다. 실행 중인 자식 프로세스를 들고 있어야 하므로 서버리스 배포는 성립하지 않는다. Cloud 배포는 V1 범위 밖이다.

---

## V1이 하지 않는 것

- AI의 자동 최종안 선택, 결과 자동 Merge, 점수화 / 순위화
- **Proposal 선택 기능.** 도구가 선택을 기록하지 않는다. 사용자가 보고 판단하면 끝이다
- 개별 실행 취소, 실시간 스트리밍(SSE), 과거 요청 검색
- 후속 요청(Refinement), Agent 간 토론, Agent의 재귀 호출
- Workflow Builder, 팀 협업 / 권한 관리, Cloud 배포

---

## Gemini 제외

Gemini CLI는 설치(0.60.0)까지는 됐으나 로그인이 되지 않아 V1 대상에서 뺐다. 인증 문제 하나 때문에 Phase 1 전체가 막히는 상황을 피한 것이다. 두 Agent로도 목적은 그대로 성립한다. 서로 다른 제안을 나란히 놓고 사용자가 보는 구조이고, 이는 2개에서도 동일하다.

추가 경로는 두 가지이고 둘 다 [Google AI Studio](https://aistudio.google.com/apikey)의 무료 API 키 하나로 열린다.

| 경로 | 방법 | 특징 |
|---|---|---|
| CLI (선호) | `GEMINI_API_KEY` 환경변수 또는 `~/.gemini/.env`로 인증 | 막힌 게 OAuth 로그인 단계라면 이것으로 풀린다. 호출 구조가 같아 비교의 성격이 유지된다 |
| REST | `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` | 안정적이지만 에이전트가 아닌 단발 모델 호출이라 비교 성격이 어긋난다 |

무료 등급 한도는 Gemini 3 Flash 기준 분당 10요청, 하루 1500요청으로 충분하다. 다만 입력 데이터가 Google의 제품 개선에 사용될 수 있다.

추가 작업 범위는 `lib/agents/gemini.ts` 한 파일과 registry 한 줄이다. 실행, 상태, 저장, 화면 어느 경로도 Agent 수를 하드코딩하지 않도록 설계했다. **다만 diff view는 2개를 전제한 화면이다.** 셋이 되면 "두 개를 골라 비교"하는 선택기가 필요하다. 유일하게 Agent 수에 걸리는 지점이라 [02-phase2-web-ui.md](02-phase2-web-ui.md)에 따로 적어 두었다.

---

## 단계 인덱스

| 문서 | 단계 | 완료 조건 |
|---|---|---|
| [00-prerequisites.md](00-prerequisites.md) | Phase 0 — 사전 준비 | 두 CLI가 비대화형으로 프롬프트 하나를 처리해 stdout으로 결과를 낸다 |
| [01-phase1-execution.md](01-phase1-execution.md) | Phase 1 — 실행과 파일 저장 | 하나의 Prompt를 두 Agent에 전달해 각 결과를 작업 폴더에 저장한다 |
| [02-phase2-web-ui.md](02-phase2-web-ui.md) | Phase 2 — 웹 UI와 diff view | 요청 입력부터 두 결과를 diff view로 확인하기까지 전체 Flow가 동작한다 |
| [03-acceptance.md](03-acceptance.md) | 검수 | Acceptance Criteria가 모두 충족된다 |

---

## 전체 구조

```
사용자 요청
    │
    ▼
Web UI ──────────────► Route Handler
(입력 / 상태 / diff view)     │
    ▲                        ▼
    │                   Orchestrator
    │                   (동일 Prompt 구성 + 병렬 실행 + 파일 저장)
    │                        │
    │  폴링                  ├──► ClaudeAdapter ──► claude CLI
    └────────────────────────┤──► CodexAdapter  ──► codex CLI
                             │
                             ┆──► GeminiAdapter (향후)
                             │
                             ▼
                    작업 폴더 (.data/tasks/<taskId>/)
                             │
                             └──► Web UI가 읽는 유일한 대상
```

Orchestrator는 답변을 만들지 않는다. 요청 검증, 동일 Prompt 구성, 병렬 실행, Timeout 처리, Error isolation, 파일 저장만 담당한다.
