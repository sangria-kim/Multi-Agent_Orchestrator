import { setTimeout as sleep } from 'node:timers/promises'

import type { AgentAdapter, AgentId, AgentRunInput, AgentRunOutput } from './types'

// 서로 다른 두 개의 고정 응답. 한쪽에만 있는 섹션과 양쪽에 다 있는 섹션을 모두
// 포함해야 diff view 검증(섹션 비교표의 두 경우)이 의미를 가진다.
const RESPONSES: Record<AgentId, string> = {
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

// 실제 CLI 없이 전체 흐름을 돌리기 위한 Adapter. AGENT_USE_MOCK=1이면 registry가
// claude/codex 자리를 이것으로 바꿔치기한다.
export function createMockAdapter(id: AgentId): AgentAdapter {
  async function run(input: AgentRunInput): Promise<AgentRunOutput> {
    // abort되면 reject되므로 삼킨다 — 실제 Adapter도 취소 시 부분 출력을 그대로 반환한다.
    await sleep(300, undefined, { signal: input.signal }).catch(() => {})
    const content = RESPONSES[id]
    return { content, raw: content, stderr: '', exitCode: 0 }
  }

  return {
    id,
    run,
    async healthCheck() {
      return { ok: true, version: 'mock' }
    },
  }
}
