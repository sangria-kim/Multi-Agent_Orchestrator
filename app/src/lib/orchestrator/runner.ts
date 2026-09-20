import fs from 'node:fs'

import * as registry from '../agents/registry'
import type { AgentAdapter, AgentId, AgentRunOutput } from '../agents/types'
import { attemptDir, createTaskFolder, errorPath, execWorkdir, promptPath, resultPath, taskJsonPath } from '../store/paths'
import type { TaskFile } from '../store/types'
import { updateAgentStatus, writeJsonAtomic, writeTextAtomic } from '../store/write'
import { buildPrompt } from './prompt'

const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 300000)

// dev 리로드를 넘겨 진행 중인 실행을 계속 추적하기 위해 globalThis에 캐시한다.
// 같은 Agent가 이미 running이면 재실행 요청을 거절하는 것도 이 레지스트리로 판단한다.
const globalForRunner = globalThis as unknown as {
  __multiOrchestratorRunning?: Map<string, AbortController>
}
const running: Map<string, AbortController> =
  globalForRunner.__multiOrchestratorRunning ?? (globalForRunner.__multiOrchestratorRunning = new Map())

export interface CreateTaskInput {
  title?: string | null
  request: string
  context?: string | null
  agentIds?: AgentId[]
}

export interface CreateTaskResult {
  taskId: string
  agentIds: AgentId[]
  prompt: string
}

// 요청 검증, taskId/작업 폴더 생성, prompt.md·task.json 저장, 각 Agent의 attempt-1을
// queued로 표시하는 데까지만 담당한다. 실제 실행은 runTask/runAgents가 한다.
export async function createTask(input: CreateTaskInput): Promise<CreateTaskResult> {
  if (!input.request || !input.request.trim()) {
    throw new Error('request must not be empty')
  }
  const agentIds = input.agentIds ?? registry.enabled().map((a) => a.id)
  if (agentIds.length === 0) {
    throw new Error('at least one agent must be selected')
  }

  const { id: taskId } = createTaskFolder(input.title ?? undefined)
  const prompt = buildPrompt({ request: input.request, context: input.context ?? null })

  writeTextAtomic(promptPath(taskId), prompt)
  const task: TaskFile = {
    id: taskId,
    title: input.title?.trim() || null,
    request: input.request,
    context: input.context ?? null,
    agents: agentIds,
    createdAt: new Date().toISOString(),
  }
  writeJsonAtomic(taskJsonPath(taskId), task)

  for (const agentId of agentIds) {
    fs.mkdirSync(attemptDir(taskId, agentId, 1), { recursive: true })
    updateAgentStatus(taskId, agentId, 1, { status: 'queued' })
  }

  return { taskId, agentIds, prompt }
}

function formatError(stdout: string, stderr: string): string {
  const parts: string[] = []
  if (stdout.trim()) parts.push(`[stdout]\n${stdout.trim()}`)
  if (stderr.trim()) parts.push(`[stderr]\n${stderr.trim()}`)
  return parts.length ? parts.join('\n\n') : '(empty output)'
}

export interface RunAgentsOptions {
  // 검증용 훅. 파일에 쓰기 전 CLI 원본 출력을 관측할 수 있게 한다
  // (스모크 스크립트가 stdout 원문과 result.md를 메모리에서 대조하는 데 쓴다).
  onOutput?: (agentId: AgentId, output: AgentRunOutput) => void
}

// 한 Agent의 한 attempt를 실행한다. adapter 하나만 알 뿐 registry나 Agent 개수를
// 참조하지 않는다 — Agent 수 비의존성이 이 함수 하나로 성립한다.
async function runOneAttempt(
  taskId: string,
  prompt: string,
  adapter: AgentAdapter,
  attempt: number,
  options?: RunAgentsOptions,
): Promise<void> {
  const key = `${taskId}/${adapter.id}`
  if (running.has(key)) {
    throw new Error(`${adapter.id} is already running for task ${taskId}`)
  }

  const controller = new AbortController()
  running.set(key, controller)
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS)

  const startedAt = new Date()
  updateAgentStatus(taskId, adapter.id, attempt, { status: 'running', startedAt: startedAt.toISOString() })

  const workdir = execWorkdir(taskId, adapter.id, attempt)
  fs.mkdirSync(workdir, { recursive: true })

  try {
    const output = await adapter.run({ prompt, workdir, signal: controller.signal })
    options?.onOutput?.(adapter.id, output)
    const completedAt = new Date()
    const executionTimeMs = completedAt.getTime() - startedAt.getTime()

    // 우리가 타임아웃으로 죽인 경우, 실제 종료 코드와 무관하게 timeout으로 기록한다.
    if (controller.signal.aborted) {
      writeTextAtomic(errorPath(taskId, adapter.id, attempt), formatError(output.raw, output.stderr))
      updateAgentStatus(taskId, adapter.id, attempt, {
        status: 'timeout',
        completedAt: completedAt.toISOString(),
        executionTimeMs,
        exitCode: output.exitCode,
      })
      return
    }

    // 판정은 종료 코드 하나로 한다. stderr가 비어 있는지는 보지 않는다.
    if (output.exitCode === 0) {
      writeTextAtomic(resultPath(taskId, adapter.id, attempt), output.content)
      updateAgentStatus(taskId, adapter.id, attempt, {
        status: 'completed',
        completedAt: completedAt.toISOString(),
        executionTimeMs,
        exitCode: 0,
      })
    } else {
      writeTextAtomic(errorPath(taskId, adapter.id, attempt), formatError(output.raw, output.stderr))
      updateAgentStatus(taskId, adapter.id, attempt, {
        status: 'failed',
        completedAt: completedAt.toISOString(),
        executionTimeMs,
        exitCode: output.exitCode,
      })
    }
  } catch (err) {
    // spawn 자체가 실패한 경우 (예: 존재하지 않는 CLI 경로).
    const completedAt = new Date()
    const executionTimeMs = completedAt.getTime() - startedAt.getTime()
    const status = controller.signal.aborted ? 'timeout' : 'failed'
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    writeTextAtomic(errorPath(taskId, adapter.id, attempt), message)
    updateAgentStatus(taskId, adapter.id, attempt, {
      status,
      completedAt: completedAt.toISOString(),
      executionTimeMs,
      exitCode: -1,
    })
  } finally {
    clearTimeout(timer)
    // 엔트리는 자식의 종료(이 함수의 반환) 시점에만 지운다. SIGTERM 직후에 지우면
    // kill grace 동안 재실행이 시작되고, 뒤늦은 종료 처리가 최신 attempt를 덮어쓴다.
    running.delete(key)
    fs.rmSync(workdir, { recursive: true, force: true })
  }
}

// 실행 핵심부. 넘겨받은 adapter 목록을 동시에 실행한다 — registry나 "2개"를 전혀
// 참조하지 않으므로 몇 개를 넘기든 동일하게 동작한다.
export async function runAgents(
  taskId: string,
  prompt: string,
  adapters: AgentAdapter[],
  attempt: number,
  options?: RunAgentsOptions,
): Promise<void> {
  // Promise.all은 첫 실패에서 즉시 reject되므로 쓰지 않는다. 한 Agent의 실패가
  // 다른 Agent의 실행에 영향을 주면 안 된다.
  await Promise.allSettled(adapters.map((adapter) => runOneAttempt(taskId, prompt, adapter, attempt, options)))
}

export async function runTask(
  taskId: string,
  prompt: string,
  agentIds: AgentId[],
  options?: RunAgentsOptions,
): Promise<void> {
  const adapters = agentIds.map((id) => {
    const adapter = registry.get(id)
    if (!adapter) throw new Error(`unknown agent: ${id}`)
    return adapter
  })
  await runAgents(taskId, prompt, adapters, 1, options)
}

// 서버 종료 시 진행 중인 프로세스 그룹을 전부 정리한다. detached: true로 띄운 자식은
// dev 서버를 Ctrl-C해도 살아남으므로, 정리하지 않으면 재시작마다 고아 프로세스가 쌓인다.
let shutdownHooked = false
export function hookShutdown(): void {
  if (shutdownHooked) return
  shutdownHooked = true
  const shutdown = () => {
    for (const controller of running.values()) controller.abort()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
