import { readSettings } from './store/settings'

export const AGENT_KILL_GRACE_MS = Number(process.env.AGENT_KILL_GRACE_MS ?? 5000)

// 설정 화면 > 환경변수 > 기본값. 실행 시작 시점에 읽으므로 진행 중인 실행은 그대로 둔다.
export function agentTimeoutMs(): number {
  const saved = readSettings().timeoutMs
  if (typeof saved === 'number' && saved > 0) return saved
  return Number(process.env.AGENT_TIMEOUT_MS ?? 300000)
}
