import { NextResponse } from 'next/server'

import { getTaskDetail } from '@/lib/store/read'

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const detail = getTaskDetail(taskId)
  if (!detail) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  }
  return NextResponse.json(detail)
}
