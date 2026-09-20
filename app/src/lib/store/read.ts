import fs from 'node:fs'

import { statusPath, taskJsonPath } from './paths'
import type { AgentStatusFile, AttemptStatus, TaskFile, TaskState } from './types'

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

export function readTask(taskId: string): TaskFile | null {
  return readJson<TaskFile>(taskJsonPath(taskId))
}

export function readAgentStatus(taskId: string, agentId: string): AgentStatusFile | null {
  return readJson<AgentStatusFile>(statusPath(taskId, agentId))
}

// 서버가 죽으면 running으로 남은 status.json이 생긴다. 부팅 시 정리하지 않고,
// 읽는 쪽에서 startedAt이 한도를 넘긴 running을 failed로 간주한다.
export function computeAgentState(status: AgentStatusFile | null, staleAfterMs: number): AttemptStatus {
  if (!status) return 'queued'
  const latest = status.attempts.find((a) => a.attempt === status.latestAttempt)
  if (!latest) return 'queued'
  if (latest.status === 'running' && latest.startedAt) {
    const startedAt = new Date(latest.startedAt).getTime()
    if (Date.now() - startedAt > staleAfterMs) return 'failed'
  }
  return latest.status
}

// 각 Agent의 최신 attempt 기준으로 Task 전체 상태를 계산한다. Agent 수와 무관하게 성립한다.
export function computeTaskState(taskId: string, agentIds: string[], staleAfterMs: number): TaskState {
  const states = agentIds.map((id) => computeAgentState(readAgentStatus(taskId, id), staleAfterMs))
  if (states.some((s) => s === 'queued' || s === 'running')) return 'running'
  const completedCount = states.filter((s) => s === 'completed').length
  if (completedCount === states.length) return 'completed'
  if (completedCount > 0) return 'partial_completed'
  return 'failed'
}
