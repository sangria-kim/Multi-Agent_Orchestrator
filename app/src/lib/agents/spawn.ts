import { spawn } from 'node:child_process'
import os from 'node:os'

import type { AgentHealth } from './types'

export interface SpawnCliOptions {
  cliPath: string
  args: string[]
  cwd: string
  input?: string
  // 없으면 중도 취소를 지원하지 않는다 (--version처럼 즉시 끝나는 호출).
  signal?: AbortSignal
  killGraceMs?: number
}

export interface SpawnCliResult {
  stdout: string
  stderr: string
  exitCode: number
}

// 공통 CLI 실행기. shell을 거치지 않고, 프롬프트는 인자가 아니라 stdin으로 넘긴다.
// 종료는 프로세스 그룹 단위로 한다 (detached: true + kill(-pid, ...)) — Codex는 자식
// 프로세스를 띄울 수 있어 부모만 죽이면 손자가 남는다.
export function spawnCli(opts: SpawnCliOptions): Promise<SpawnCliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.cliPath, opts.args, {
      cwd: opts.cwd,
      shell: false,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let settled = false
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let killTimer: NodeJS.Timeout | undefined
    const signal = opts.signal

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
      if (killTimer) clearTimeout(killTimer)
    }

    const onAbort = () => {
      if (settled || child.pid === undefined) return
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        // 이미 종료된 경우
      }
      killTimer = setTimeout(() => {
        if (settled || child.pid === undefined) return
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          // 이미 종료된 경우
        }
      }, opts.killGraceMs ?? 5000)
    }
    signal?.addEventListener('abort', onAbort)

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    child.stdin.on('error', () => {
      // 프로세스가 이미 종료되어 stdin이 닫힌 경우 (EPIPE) 무시. close/error 핸들러가 결과를 처리한다.
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      cleanup()
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code ?? 1,
      })
    })

    child.stdin.write(opts.input ?? '', () => {
      child.stdin.end()
    })

    if (signal?.aborted) onAbort()
  })
}

// CLI 설치 여부 확인. --version이 0으로 끝나면 사용 가능으로 본다.
// cwd는 레포 밖 임시 디렉터리로 둔다 — 버전 확인이 프로젝트 설정을 읽지 않게.
export async function versionHealthCheck(cliPath: string): Promise<AgentHealth> {
  try {
    const { stdout, exitCode } = await spawnCli({ cliPath, args: ['--version'], cwd: os.tmpdir() })
    if (exitCode !== 0) return { ok: false, reason: `exit ${exitCode}` }
    return { ok: true, version: stdout.trim() }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}
