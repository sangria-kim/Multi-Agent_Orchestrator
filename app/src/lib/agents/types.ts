export type AgentId = 'claude' | 'codex'

export interface AgentRunInput {
  prompt: string // buildPrompt() 결과. 모든 Agent가 동일한 값을 받는다
  workdir: string // 격리된 빈 디렉터리
  signal: AbortSignal // 타임아웃용
}

export interface AgentRunOutput {
  content: string // 앞뒤 공백을 다듬은 본문. result.md에 그대로 저장된다
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
}
