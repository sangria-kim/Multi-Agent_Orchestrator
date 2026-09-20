import fs from 'node:fs'

import { NextResponse } from 'next/server'

import * as registry from '@/lib/agents/registry'
import type { AgentId } from '@/lib/agents/types'
import { retryAgent } from '@/lib/orchestrator/runner'
import { promptPath } from '@/lib/store/paths'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string; agent: string }> },
) {
  const { taskId, agent } = await params

  if (!fs.existsSync(promptPath(taskId))) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  }
  if (!registry.get(agent as AgentId)) {
    return NextResponse.json({ error: `unknown agent: ${agent}` }, { status: 400 })
  }

  try {
    const { attempt } = retryAgent(taskId, agent as AgentId)
    return NextResponse.json({ attempt }, { status: 202 })
  } catch (err) {
    // 이미 실행 중인 Agent를 다시 재실행하려는 경우
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 })
  }
}
