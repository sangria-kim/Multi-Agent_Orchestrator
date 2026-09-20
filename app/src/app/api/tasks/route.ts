import { NextResponse } from 'next/server'

import type { AgentId } from '@/lib/agents/types'
import { createTask, runTask } from '@/lib/orchestrator/runner'
import { listTasks } from '@/lib/store/read'

export async function GET() {
  return NextResponse.json({ tasks: listTasks(50) })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.request !== 'string') {
    return NextResponse.json({ error: '요청 내용이 필요합니다' }, { status: 400 })
  }

  try {
    const { taskId, agentIds, prompt } = await createTask({
      title: typeof body.title === 'string' ? body.title : null,
      request: body.request,
      context: typeof body.context === 'string' ? body.context : null,
      agentIds: Array.isArray(body.agentIds) ? (body.agentIds as AgentId[]) : undefined,
    })

    // 실행은 기다리지 않는다. 클라이언트는 taskId로 이동해 폴링으로 진행 상황을 본다.
    runTask(taskId, prompt, agentIds).catch((err) => {
      console.error(`runTask failed for ${taskId}:`, err)
    })

    return NextResponse.json({ taskId }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }
}
