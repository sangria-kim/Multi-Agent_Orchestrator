import fs from 'node:fs'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { AGENT_OPTIONS, resolveAgentOptions } from '@/lib/agents/options'
import * as registry from '@/lib/agents/registry'
import { agentTimeoutMs } from '@/lib/env'
import { hasRunningAgents } from '@/lib/orchestrator/runner'
import { dataDirWithSource } from '@/lib/store/paths'
import { writeSettings } from '@/lib/store/settings'

const MIN_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 3_600_000

function current() {
  return {
    ...dataDirWithSource(),
    timeoutMs: agentTimeoutMs(),
    models: Object.fromEntries(registry.enabled().map((a) => [a.id, resolveAgentOptions(a.id)])),
    // 유효값은 서버에서만 정의한다 — UI 드롭다운과 검증이 같은 목록을 쓴다.
    options: AGENT_OPTIONS,
  }
}

export async function GET() {
  return NextResponse.json(current())
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '설정 값이 필요합니다' }, { status: 400 })
  }

  const patch: Parameters<typeof writeSettings>[0] = {}

  if ('dataDir' in body) {
    if (body.dataDir !== null && typeof body.dataDir !== 'string') {
      return NextResponse.json({ error: '저장 위치가 올바르지 않습니다' }, { status: 400 })
    }
    // 저장 위치만 실행 중 변경을 막는다. 진행 중인 attempt의 결과가 새 위치로 떨어지면
    // task가 쪼개진다. 나머지 항목은 다음 실행부터 적용되므로 안전하다.
    if (hasRunningAgents()) {
      return NextResponse.json({ error: '실행 중인 작업이 끝난 뒤에 변경할 수 있습니다' }, { status: 409 })
    }

    const dir = typeof body.dataDir === 'string' ? body.dataDir.trim() : ''
    if (dir) {
      if (!path.isAbsolute(dir)) {
        return NextResponse.json({ error: '절대 경로를 입력해주세요 (예: /Users/me/multi-data)' }, { status: 400 })
      }
      // 실제로 만들고 써봐야 권한·잘못된 경로를 저장 전에 걸러낼 수 있다.
      try {
        const probe = path.join(dir, '.write-probe')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(probe, '')
        fs.unlinkSync(probe)
      } catch (err) {
        return NextResponse.json(
          { error: `해당 경로에 쓸 수 없습니다: ${err instanceof Error ? err.message : String(err)}` },
          { status: 400 },
        )
      }
    }
    patch.dataDir = dir || null
  }

  if ('timeoutMs' in body) {
    if (body.timeoutMs !== null) {
      if (
        typeof body.timeoutMs !== 'number' ||
        !Number.isInteger(body.timeoutMs) ||
        body.timeoutMs < MIN_TIMEOUT_MS ||
        body.timeoutMs > MAX_TIMEOUT_MS
      ) {
        return NextResponse.json(
          { error: `타임아웃은 ${MIN_TIMEOUT_MS / 1000}~${MAX_TIMEOUT_MS / 1000}초 사이여야 합니다` },
          { status: 400 },
        )
      }
    }
    patch.timeoutMs = body.timeoutMs
  }

  if ('models' in body) {
    if (!body.models || typeof body.models !== 'object') {
      return NextResponse.json({ error: '모델 설정이 올바르지 않습니다' }, { status: 400 })
    }
    const models: Record<string, { model: string; effort: string }> = {}
    for (const [id, value] of Object.entries(body.models as Record<string, unknown>)) {
      const spec = AGENT_OPTIONS[id as keyof typeof AGENT_OPTIONS]
      const opt = value as { model?: unknown; effort?: unknown }
      if (
        !spec ||
        typeof opt?.model !== 'string' ||
        typeof opt?.effort !== 'string' ||
        !spec.models.includes(opt.model) ||
        !spec.efforts.includes(opt.effort)
      ) {
        return NextResponse.json({ error: `${id}의 모델/effort 값이 올바르지 않습니다` }, { status: 400 })
      }
      models[id] = { model: opt.model, effort: opt.effort }
    }
    patch.models = models
  }

  writeSettings(patch)
  return NextResponse.json(current())
}
