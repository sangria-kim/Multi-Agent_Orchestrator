'use client'

import { useEffect, useState } from 'react'

const SOURCE_LABEL: Record<string, string> = {
  settings: '설정 화면에서 지정',
  env: '환경변수 ORCHESTRATOR_DATA_DIR',
  default: '기본값',
}

export default function Settings() {
  const [dir, setDir] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data: { dir: string; source: string }) => {
        setDir(data.dir)
        setSource(data.source)
      })
      .catch(() => setError('현재 설정을 불러올 수 없습니다'))
  }, [])

  async function handleSave(value: string) {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataDir: value }),
      })
      const body = await res.json()
      if (!res.ok) setError(body.error ?? '저장할 수 없습니다')
      else {
        setDir(body.dir)
        setSource(body.source)
        setSaved(true)
      }
    } catch {
      setError('네트워크 오류로 저장할 수 없습니다')
    }
    setSaving(false)
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="mb-1 text-xl font-semibold">설정</h1>
      <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
        작업 결과(prompt.md, result.md 등)를 저장할 위치를 지정합니다. 재시작 없이 바로 적용됩니다.
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">작업 결과 저장 위치</label>
          <input
            type="text"
            value={dir}
            onChange={(e) => {
              setDir(e.target.value)
              setSaved(false)
            }}
            placeholder="/Users/me/multi-data"
            className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            절대 경로만 사용할 수 있습니다. 작업은 이 경로 아래 <code>tasks/</code>에 저장됩니다.
            {source && ` 현재 출처: ${SOURCE_LABEL[source] ?? source}.`}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            위치를 바꾸면 이전 위치에 있던 작업은 목록에 보이지 않습니다 (파일은 그대로 남습니다).
          </p>
        </div>

        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        {saved && <p className="text-sm text-green-700 dark:text-green-400">저장했습니다.</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving || !dir.trim()}
            onClick={() => handleSave(dir)}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
          <button
            type="button"
            disabled={saving || source !== 'settings'}
            onClick={() => handleSave('')}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            기본값으로 되돌리기
          </button>
        </div>
      </div>
    </main>
  )
}
