import { claudeAdapter } from './claude'
import { codexAdapter } from './codex'
import { createMockAdapter } from './mock'
import type { AgentAdapter, AgentHealth, AgentId } from './types'

const USE_MOCK = process.env.AGENT_USE_MOCK === '1'

const realAdapters: AgentAdapter[] = [claudeAdapter, codexAdapter]
const adapters: AgentAdapter[] = USE_MOCK ? realAdapters.map((a) => createMockAdapter(a.id)) : realAdapters
const byId = new Map(adapters.map((a) => [a.id, a]))

// 사용 가능한 Agent 목록은 항상 여기서 읽는다. 리터럴 유니온을 복제하지 않는다.
export function enabled(): AgentAdapter[] {
  return adapters
}

export function get(id: AgentId): AgentAdapter | undefined {
  return byId.get(id)
}

export async function healthCheckAll(): Promise<Record<string, AgentHealth>> {
  const results = await Promise.all(adapters.map(async (a) => [a.id, await a.healthCheck()] as const))
  return Object.fromEntries(results)
}
