export type AgentId = 'claude' | 'codex' | 'mock' // 향후 'gemini' 추가

export interface AgentRunInput {
  prompt: string // buildPrompt() 결과. 모든 Agent가 동일한 값을 받는다
  workdir: string // 격리된 빈 디렉터리
  signal: AbortSignal // 타임아웃용
}

export interface AgentRunOutput {
  content: string // normalizeResult() 통과 후의 본문
  raw: string // 가공 전 stdout 전문
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
