import os from 'node:os'

import { AGENT_KILL_GRACE_MS } from '../env'
import { spawnCli } from './spawn'
import type { AgentAdapter, AgentHealth, AgentRunInput, AgentRunOutput } from './types'

// 00-prerequisites.md에서 확인한 고정값. 추측으로 바꾸지 않는다.
const CLI_PATH = process.env.CLAUDE_CLI_PATH || 'claude'
const MODEL = 'sonnet'
const EFFORT = 'high'

function normalizeResult(raw: string): string {
  return raw.trim()
}

async function run(input: AgentRunInput): Promise<AgentRunOutput> {
  const { stdout, stderr, exitCode } = await spawnCli({
    cliPath: CLI_PATH,
    args: ['-p', '--tools', '', '--output-format', 'text', '--model', MODEL, '--effort', EFFORT],
    input: input.prompt,
    cwd: input.workdir,
    signal: input.signal,
    killGraceMs: AGENT_KILL_GRACE_MS,
  })
  return { content: normalizeResult(stdout), raw: stdout, stderr, exitCode }
}

async function healthCheck(): Promise<AgentHealth> {
  try {
    const { stdout, exitCode } = await spawnCli({
      cliPath: CLI_PATH,
      args: ['--version'],
      input: '',
      cwd: os.tmpdir(),
      signal: new AbortController().signal,
      killGraceMs: 1000,
    })
    if (exitCode !== 0) return { ok: false, reason: `exit ${exitCode}` }
    return { ok: true, version: stdout.trim() }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export const claudeAdapter: AgentAdapter = {
  id: 'claude',
  run,
  healthCheck,
  normalizeResult,
}
