import { readSettings } from '../store/settings'
import type { AgentId } from './types'

// 유효값은 실제 CLI에서 확인한 것만 넣는다. 추측으로 늘리지 않는다.
// - claude: `claude --help`의 --model(별칭 예시) / --effort(low, medium, high, xhigh, max)
// - codex: reasoning effort는 잘못된 값으로 실행했을 때 API가 돌려준 목록.
//   모델은 CLI가 목록을 제공하지 않아, 실제로 실행해 통과한 값만 둔다(추가는 확인 후 손으로).
//   mini/codex 계열 이름은 전부 "not supported" 400이라 넣지 않았다.
// 목록은 비싼 것 → 싼 것 순서다.
export const AGENT_OPTIONS: Record<AgentId, { models: string[]; efforts: string[]; default: { model: string; effort: string } }> = {
  claude: {
    models: ['fable', 'opus', 'sonnet', 'haiku'],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    default: { model: 'sonnet', effort: 'high' },
  },
  codex: {
    models: ['gpt-5.6-terra', 'gpt-5.6-sol'],
    efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    default: { model: 'gpt-5.6-terra', effort: 'high' },
  },
}

// 설정값은 그대로 spawn 인자가 되므로 여기서 한 번 더 거른다.
// (손으로 고친 .settings.json이 CLI로 새어 들어가지 않게 한다.)
export function resolveAgentOptions(id: AgentId): { model: string; effort: string } {
  const spec = AGENT_OPTIONS[id]
  const saved = readSettings().models?.[id]
  return {
    model: saved && spec.models.includes(saved.model) ? saved.model : spec.default.model,
    effort: saved && spec.efforts.includes(saved.effort) ? saved.effort : spec.default.effort,
  }
}
