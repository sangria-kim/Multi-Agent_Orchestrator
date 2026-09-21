import fs from 'node:fs'

import { AGENT_KILL_GRACE_MS, AGENT_TIMEOUT_MS } from '../env'
import { errorPath, resultPath, statusPath, taskDir, taskJsonPath, TASKS_DIR } from './paths'
import type { AgentStatusFile, AttemptStatus, TaskFile, TaskState } from './types'

// running 상태가 서버 재시작으로 멈춰 있는지 판단하는 기준. 타임아웃 한도 +
// kill grace 만큼 여유를 둬 정상적으로 timeout 처리 중인 것과 헷갈리지 않게 한다.
const STALE_AFTER_MS = AGENT_TIMEOUT_MS + AGENT_KILL_GRACE_MS

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
export function computeAgentState(status: AgentStatusFile | null): AttemptStatus {
  if (!status) return 'queued'
  const latest = status.attempts.find((a) => a.attempt === status.latestAttempt)
  if (!latest) return 'queued'
  if (latest.status === 'running' && latest.startedAt) {
    const startedAt = new Date(latest.startedAt).getTime()
    if (Date.now() - startedAt > STALE_AFTER_MS) return 'failed'
  }
  return latest.status
}

// 각 Agent의 최신 attempt 기준으로 Task 전체 상태를 계산한다. Agent 수와 무관하게 성립한다.
export function computeTaskState(taskId: string, agentIds: string[]): TaskState {
  const states = agentIds.map((id) => computeAgentState(readAgentStatus(taskId, id)))
  if (states.some((s) => s === 'queued' || s === 'running')) return 'running'
  const completedCount = states.filter((s) => s === 'completed').length
  if (completedCount === states.length) return 'completed'
  if (completedCount > 0) return 'partial_completed'
  return 'failed'
}

function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

export interface TaskSummary {
  id: string
  title: string | null
  request: string
  createdAt: string
  taskState: TaskState
  agentStates: Record<string, AttemptStatus>
}

// 작업 폴더를 이름 역순(최신순)으로 최대 limit개 읽는다. 검색·필터·페이지네이션은 없다.
export function listTasks(limit: number): TaskSummary[] {
  if (!fs.existsSync(TASKS_DIR)) return []
  const ids = fs.readdirSync(TASKS_DIR).sort().reverse().slice(0, limit)

  return ids.flatMap((id) => {
    const task = readTask(id)
    if (!task) return []

    const agentStates: Record<string, AttemptStatus> = {}
    for (const agentId of task.agents) {
      agentStates[agentId] = computeAgentState(readAgentStatus(id, agentId))
    }

    return [
      {
        id: task.id,
        title: task.title,
        request: task.request,
        createdAt: task.createdAt,
        taskState: computeTaskState(id, task.agents),
        agentStates,
      },
    ]
  })
}

export interface AgentView {
  id: string
  attempt: number
  status: AttemptStatus
  startedAt?: string
  executionTimeMs?: number
  result?: string
  error?: string
  // 최신 attempt가 실패/timeout인데 이전에 completed된 attempt가 있으면 채운다.
  previousCompleted?: { attempt: number; result: string }
}

export interface TaskDetail {
  id: string
  title: string | null
  request: string
  context: string | null
  createdAt: string
  taskDir: string
  taskState: TaskState
  agentViews: AgentView[]
}

// task.json + 각 Agent의 status.json + 결과/에러 본문을 한 번에 모아 돌려준다.
// 결과가 파일 두 개뿐이라 별도 엔드포인트로 나눌 이유가 없다 (02-phase2-web-ui.md).
export function getTaskDetail(taskId: string): TaskDetail | null {
  const task = readTask(taskId)
  if (!task) return null

  const agentViews: AgentView[] = task.agents.map((agentId) => {
    const statusFile = readAgentStatus(taskId, agentId)
    const status = computeAgentState(statusFile)
    const attempt = statusFile?.latestAttempt ?? 1
    const latest = statusFile?.attempts.find((a) => a.attempt === attempt)

    const view: AgentView = {
      id: agentId,
      attempt,
      status,
      startedAt: latest?.startedAt,
      executionTimeMs: latest?.executionTimeMs,
    }

    if (status === 'completed') {
      const result = readTextFile(resultPath(taskId, agentId, attempt))
      if (result !== null) view.result = result
    } else if (status === 'failed' || status === 'timeout') {
      const error = readTextFile(errorPath(taskId, agentId, attempt))
      if (error !== null) view.error = error

      const previous = statusFile?.attempts
        .filter((a) => a.attempt < attempt && a.status === 'completed')
        .sort((a, b) => b.attempt - a.attempt)[0]
      if (previous) {
        const previousResult = readTextFile(resultPath(taskId, agentId, previous.attempt))
        if (previousResult !== null) view.previousCompleted = { attempt: previous.attempt, result: previousResult }
      }
    }

    return view
  })

  return {
    id: task.id,
    title: task.title,
    request: task.request,
    context: task.context,
    createdAt: task.createdAt,
    taskDir: taskDir(taskId),
    taskState: computeTaskState(taskId, task.agents),
    agentViews,
  }
}
