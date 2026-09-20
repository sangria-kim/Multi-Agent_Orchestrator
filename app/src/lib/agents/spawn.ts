import { spawn } from 'node:child_process'

export interface SpawnCliOptions {
  cliPath: string
  args: string[]
  input: string
  cwd: string
  signal: AbortSignal
  killGraceMs: number
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

    const cleanup = () => {
      opts.signal.removeEventListener('abort', onAbort)
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
      }, opts.killGraceMs)
    }
    opts.signal.addEventListener('abort', onAbort)

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

    child.stdin.write(opts.input, () => {
      child.stdin.end()
    })

    if (opts.signal.aborted) onAbort()
  })
}
