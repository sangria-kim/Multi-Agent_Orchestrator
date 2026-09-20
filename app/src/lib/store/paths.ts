import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 상대 경로이므로 프로세스 시작 시점에 한 번 절대 경로화해 모듈 상수로 고정한다.
// (00-prerequisites.md: dev/build/start의 process.cwd()가 같다는 보장이 없다)
export const DATA_DIR = path.resolve(process.cwd(), process.env.ORCHESTRATOR_DATA_DIR || './.data')
export const TASKS_DIR = path.join(DATA_DIR, 'tasks')

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function formatTimestamp(date: Date): string {
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${y}${m}${d}-${hh}${mm}${ss}`
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '')
}

export function taskDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId)
}

export function taskJsonPath(taskId: string): string {
  return path.join(taskDir(taskId), 'task.json')
}

export function promptPath(taskId: string): string {
  return path.join(taskDir(taskId), 'prompt.md')
}

export function agentDir(taskId: string, agentId: string): string {
  return path.join(taskDir(taskId), agentId)
}

export function statusPath(taskId: string, agentId: string): string {
  return path.join(agentDir(taskId, agentId), 'status.json')
}

export function attemptDir(taskId: string, agentId: string, attempt: number): string {
  return path.join(agentDir(taskId, agentId), `attempt-${attempt}`)
}

export function resultPath(taskId: string, agentId: string, attempt: number): string {
  return path.join(attemptDir(taskId, agentId, attempt), 'result.md')
}

export function errorPath(taskId: string, agentId: string, attempt: number): string {
  return path.join(attemptDir(taskId, agentId, attempt), 'error.txt')
}

// 실행 cwd는 레포 밖 임시 디렉터리에 둔다 (01-phase1-execution.md: 실행 디렉터리 격리).
export function execWorkdir(taskId: string, agentId: string, attempt: number): string {
  return path.join(os.tmpdir(), 'multi-orchestrator', taskId, agentId, `attempt-${attempt}`)
}

// taskId 폴더 생성. 존재 확인 후 생성이 아니라 mkdirSync(recursive:false)의 실패를
// 충돌 신호로 쓴다 (확인과 생성 사이의 경쟁을 없앤다).
export function createTaskFolder(title?: string | null): { id: string; dir: string } {
  fs.mkdirSync(TASKS_DIR, { recursive: true })
  const ts = formatTimestamp(new Date())
  const slug = title ? slugify(title) : ''
  const base = slug ? `${ts}-${slug}` : ts

  let suffix = 0
  for (;;) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    const dir = path.join(TASKS_DIR, candidate)
    try {
      fs.mkdirSync(dir, { recursive: false })
      return { id: candidate, dir }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        suffix++
        continue
      }
      throw err
    }
  }
}
