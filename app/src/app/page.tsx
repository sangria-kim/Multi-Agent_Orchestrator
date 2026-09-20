'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AgentOption {
  id: string
  ok: boolean
  version?: string
  reason?: string
}

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: '계획서 작성',
    text: '신규 기능 구현 계획서를 작성해줘. PM과 개발자가 구현 전에 범위와 구현 순서를 합의할 수 있는 문서여야 한다.',
  },
  {
    label: '조사 / 아이디어',
    text: '사용자 인증 방식을 무엇으로 할지 조사해줘. 후보를 3개 이상 제시하고 각각의 장단점과 우리 상황에서의 적용 조건을 정리해줘.',
  },
  {
    label: '문서 포맷 제안',
    text: 'PRD의 Markdown 포맷을 제안해줘. 각 Section의 목적을 함께 설명해줘.',
  },
]

export default function Home() {
  const router = useRouter()
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [request, setRequest] = useState('')
  const [context, setContext] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data: { agents: AgentOption[] }) => {
        setAgents(data.agents)
        setSelected(new Set(data.agents.filter((a) => a.ok).map((a) => a.id)))
      })
      .catch(() => setAgents([]))
  }, [])

  function toggleAgent(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSubmit = request.trim().length > 0 && selected.size > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          request,
          context: context.trim() || null,
          agentIds: Array.from(selected),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? '요청을 시작할 수 없습니다')
        setSubmitting(false)
        return
      }
      router.push(`/tasks/${body.taskId}`)
    } catch {
      setError('네트워크 오류로 요청을 시작할 수 없습니다')
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-1 text-xl font-semibold">새 요청</h1>
      <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
        Claude와 Codex에 같은 요청을 동시에 보내고, 각자의 결과를 나란히 비교합니다.
      </p>

      <div className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium">요청 제목 (선택)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="비우면 요청 내용 앞부분이 대신 표시됩니다"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">요청 내용</label>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={6}
            placeholder="무엇을 만들어줬으면 하는지 적어주세요"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setRequest(ex.text)}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">추가 Context (선택)</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="참고할 배경 정보가 있다면 적어주세요"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">실행 Agent 선택</label>
          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <label
                key={agent.id}
                className={`flex items-center gap-2 text-sm ${agent.ok ? '' : 'opacity-50'}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(agent.id)}
                  disabled={!agent.ok}
                  onChange={() => toggleAgent(agent.id)}
                />
                <span className="capitalize">{agent.id}</span>
                {!agent.ok && <span className="text-xs text-red-500">({agent.reason ?? '사용 불가'})</span>}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? '실행 중…' : '실행'}
        </button>
      </div>
    </main>
  )
}
