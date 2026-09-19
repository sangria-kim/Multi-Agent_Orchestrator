# 결정 기록 (Decision Log)

프로젝트를 진행하며 내린 판단과 그 근거를 시간순으로 기록한다. "왜 이렇게 했는가"만 남긴다. 세부 사용법이나 명령어는 [plan/](plan/) 문서에 있으므로 중복하지 않는다.

---

## 1. 대상 Agent — Claude, Codex 2개 (Gemini 제외)

Gemini CLI는 설치는 됐지만 OAuth 로그인이 되지 않았다. 인증 문제 하나 때문에 Phase 1 전체가 막히는 상황을 피하기 위해 V1 대상에서 뺐다.

- 두 Agent로도 "서로 다른 제안을 나란히 놓고 사용자가 본다"는 목적은 그대로 성립한다.
- 나중에 추가할 경로(CLI + `GEMINI_API_KEY`, 또는 REST API)는 [plan/README.md](plan/README.md)의 "Gemini 제외" 절에 남겨뒀다.
- 다만 diff view는 현재 2개 결과를 전제로 설계했다. Agent가 3개 이상이 되면 "두 개를 골라 비교"하는 선택기가 추가로 필요하다.

## 2. 저장소 — DB 없이 파일 시스템만 사용

이 도구가 다루는 데이터는 "요청 하나에 결과 문서 두 편"이고 조회 패턴은 "폴더 목록"과 "폴더 하나 열기"뿐이라 관계형 질의가 필요 없다.

- 결과가 마크다운 파일 그대로 남아 에디터·Finder·`git`·`diff` 어느 도구로도 열 수 있다.
- 스키마 마이그레이션, 커넥션 싱글턴, WAL, 부팅 시 상태 정리가 전부 사라진다.
- "원본 결과를 덮어쓰지 않는다"는 원칙이 "파일을 새로 쓰기만 한다"는 구현으로 그대로 이어진다.

## 3. 스택 — Next.js 단일 스택 (Python/FastAPI 대신)

로컬 Node는 24.15로 바로 쓸 수 있었지만 Python은 3.9.6이라 FastAPI를 쓰려면 3.11+ 설치가 선행돼야 했다. 백엔드가 하는 일은 CLI subprocess 실행과 파일 읽기/쓰기뿐이라 별도 백엔드 스택 없이 Next.js Route Handler + `child_process`로 처리하기로 했다.

## 4. Agent 호출 — CLI subprocess, 모델을 코드에 고정

`claude`, `codex` 둘 다 비대화형 실행을 CLI subprocess로 붙였다 (REST API 대신). 이때 각 CLI의 모델을 명시적으로 고정했다: Claude `sonnet` + `--effort high`, Codex `gpt-5.6-terra` + `model_reasoning_effort=high`.

- 모델을 고정하지 않으면 로컬 config를 바꾸거나 CLI를 업데이트할 때마다 결과를 만든 모델이 조용히 바뀌어 두 결과를 비교한 근거가 흔들린다.
- Codex는 `--ignore-user-config`를 켜면 사용자 config의 모델이 아니라 CLI 내장 기본값으로 바뀌는 것까지 실측으로 확인했다 → 그래서 `-m`으로 별도 고정이 필수라고 판단했다.

## 5. 실행 격리 — `--bare`를 쓰지 않고, cwd를 레포 밖으로 뺀다

Claude의 `--bare` 옵션은 hooks·플러그인·`CLAUDE.md` 자동 탐색을 모두 건너뛰어 재현성 면에서는 이상적이지만, 인증을 `ANTHROPIC_API_KEY`/`apiKeyHelper`로만 처리하고 OAuth·키체인을 읽지 않는다. 이 환경은 API 키 없이 구독 로그인만 쓰므로 `--bare`를 켜면 즉시 인증 실패한다. 같은 이유로 `--setting-sources ""`도 실제로 넣어보니 인증이 깨져서 쓰지 않기로 했다.

대신 격리는 **실행 cwd를 레포 밖의 임시 디렉터리로 두는 방식**으로 얻는다.

- `--tools ""`는 도구만 끄지 파일 탐색은 막지 않는다. Claude는 `CLAUDE.md`를 cwd에서 상위로 올라가며 찾고, Codex도 cwd에서 git 루트를 찾아 워크스페이스로 잡기 때문에, cwd가 레포 안에 있으면 프로젝트 파일이 컨텍스트로 끌려 들어온다.
- `~/.claude/CLAUDE.md`는 cwd와 무관하게 항상 로드되며 이건 막을 수 없다. 다만 모든 실행에 동일하게 적용되므로 Agent 간 비대칭을 만들지 않는다고 보고 한계로만 기록하고 넘어갔다 (Same Input 원칙이 요구하는 건 "모든 Agent가 같은 입력을 받는 것"이지 "provider 기본 설정까지 서로 같은 것"은 아니라고 판단).
- Codex 실행에는 `--skip-git-repo-check`(작업 폴더가 git 저장소가 아니어도 거부되지 않도록), `--ephemeral`(세션 파일을 디스크에 남기지 않음), `--ignore-user-config`(로컬 config가 결과에 섞이지 않도록)를 함께 건다.

## 6. 실패 판정 — 종료 코드로만 판정한다

Codex는 성공해도 stderr에 배너를 찍기 때문에 "stderr가 비어있지 않으면 실패"로 판정하면 안 된다. 반대로 Claude는 인증 실패 시 에러 메시지를 stdout에 찍고 종료 코드 1로 끝난다. 그래서 성공/실패는 오직 `exitCode !== 0`으로만 판정하고, 실패일 때만 `result.md` 대신 `error.txt`를 남기기로 했다. 종료 코드를 먼저 보지 않으면 인증 에러 문구가 정상 결과 파일로 저장되는 사고가 난다.

## 7. 결과 비교 방식 — diff view (병합/점수화 없음)

핵심 원칙에 따라 도구는 두 결과를 병합하거나 순위를 매기지 않는다. 화면은 나란히 보기 + 섹션 비교(diff view)만 제공하고 최종 선택은 사용자가 한다. 별도 diff 라이브러리도 쓰지 않고, 섹션 비교는 마크다운 헤딩을 정규식으로 뽑아 문자열로 맞춰보는 정도로 충분하다고 판단했다.

## 8. 상태 갱신 — 폴링 (SSE 대신)

실시간 스트리밍(SSE)은 V1 범위 밖으로 뒀다. 실행 중일 때만 1초 간격으로 상태 파일을 읽는 폴링으로 충분하다고 판단했고, 오케스트레이터가 단일 장수명 Node 프로세스로 동작하는 전제(자식 프로세스를 들고 있어야 하므로 서버리스 배포 불가)와도 맞는다.

## 9. 프로젝트 스캐폴딩 — 최상위 git 저장소 하나만 유지

`create-next-app`이 `app/` 안에 자체 git 저장소를 만들기 때문에, 초기화 직후 `app/.git`을 제거하고 나서 최상위(`multi/`)에서 `git init`했다. 순서를 바꾸면 `app/`이 최상위 저장소에 gitlink(빈 서브모듈 참조)로 잡혀 파일이 하나도 커밋되지 않는 문제가 있어 순서를 명시적으로 지켰다.

`app/AGENTS.md`, `app/CLAUDE.md` 보일러플레이트는 지우지 않고 그대로 뒀다 — 위 5번 항목의 "cwd를 레포 밖으로 빼는" 설계가 애초에 이 파일들이 끌려 들어오는 문제를 우회하는 근거이기 때문에, 지울 이유가 없다고 판단했다.

## 10. GitHub 원격 저장소 연결 — merge, force-push 금지 / SSH 사용

로컬 저장소를 기존 GitHub 저장소(`sangria-kim/Multi-Agnet_Orchestrator`)에 연결하는 과정에서 두 가지를 판단했다.

- **origin에 이미 커밋(기본 README)이 있어 히스토리가 갈렸다.** 로컬 히스토리를 강제로 덮어쓰는 force-push 대신, `git merge origin/main --allow-unrelated-histories`로 원격의 초기 커밋을 로컬 히스토리에 편입시키는 방식을 택했다. 원격에 이미 존재하는 커밋을 삭제하지 않는 비파괴적 방법이라 판단했다.
- **HTTPS push가 인증 정보 부재로 실패**(`could not read Username`)해서, 이미 GitHub 계정과 연결돼 있던 SSH 키로 origin URL을 `git@github.com:...`로 바꿔 push했다. 별도로 자격 증명을 입력하거나 새로 발급하지 않고 기존 SSH 인증을 그대로 활용했다.
