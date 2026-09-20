import type { AgentAdapter, AgentId, AgentRunInput, AgentRunOutput } from './types'

// 서로 다른 두 개 이상의 고정 응답. 한쪽에만 있는 섹션과 양쪽에 다 있는 섹션을 모두
// 포함해야 diff view 검증(섹션 비교표의 두 경우)이 의미를 가진다.
const RESPONSES: Record<string, string> = {
  claude: `# 제안

## 개요

Mock Claude Adapter가 만든 고정 응답이다. 실제 CLI를 호출하지 않는다.

## 공통 섹션

두 Agent 모두 이 섹션을 포함한다. diff view에서 "양쪽에 있는 섹션" 케이스를 확인하는 용도다.

## Claude 전용 섹션

이 섹션은 Claude 쪽 응답에만 존재한다. diff view에서 "한쪽에만 있는 섹션" 케이스를 확인하는 용도다.
`,
  codex: `# 제안

## 개요

Mock Codex Adapter가 만든 고정 응답이다. 실제 CLI를 호출하지 않는다.

## 공통 섹션

두 Agent 모두 이 섹션을 포함한다. diff view에서 "양쪽에 있는 섹션" 케이스를 확인하는 용도다.

## Codex 전용 섹션

이 섹션은 Codex 쪽 응답에만 존재한다. diff view에서 "한쪽에만 있는 섹션" 케이스를 확인하는 용도다.
`,
}

const FALLBACK_RESPONSE = (id: string) => `# 제안 (${id})

## 개요

Mock Adapter가 만든 고정 응답이다. Agent 수 비의존성 검증처럼 claude/codex 외의 id로
등록된 경우 이 응답을 쓴다.
`

function responseFor(id: string): string {
  return RESPONSES[id] ?? FALLBACK_RESPONSE(id)
}

function sleepRespectingAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort)
  })
}

// 실제 CLI 없이 전체 흐름을 돌리기 위한 Adapter. id를 인자로 받아 claude/codex 자리를
// 바꿔치기하거나(AGENT_USE_MOCK=1), Agent 수 비의존성 검증에서 세 번째 Agent로도 쓴다.
export function createMockAdapter(id: AgentId): AgentAdapter {
  async function run(input: AgentRunInput): Promise<AgentRunOutput> {
    await sleepRespectingAbort(300, input.signal)
    const content = responseFor(id)
    return { content, raw: content, stderr: '', exitCode: 0 }
  }

  return {
    id,
    run,
    async healthCheck() {
      return { ok: true, version: 'mock' }
    },
    normalizeResult: (raw: string) => raw.trim(),
  }
}
