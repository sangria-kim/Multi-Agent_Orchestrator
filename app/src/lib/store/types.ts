export type AttemptStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timeout'

export type TaskState = 'running' | 'completed' | 'partial_completed' | 'failed'

export interface AttemptRecord {
  attempt: number
  status: AttemptStatus
  startedAt?: string
  completedAt?: string
  executionTimeMs?: number
  exitCode?: number
}

export interface AgentStatusFile {
  agent: string
  latestAttempt: number
  attempts: AttemptRecord[]
}

export interface TaskFile {
  id: string
  title: string | null
  request: string
  context: string | null
  agents: string[]
  createdAt: string
}
