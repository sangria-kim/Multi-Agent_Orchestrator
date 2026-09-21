'use client'

import { useEffect, useState } from 'react'

const SOURCE_LABEL: Record<string, string> = {
  settings: '설정 화면에서 지정',
  env: '환경변수 ORCHESTRATOR_DATA_DIR',
  default: '기본값',
}

interface AgentOption {
  model: string
  effort: string
}

interface SettingsResponse {
  dir: string
  source: string
  timeoutMs: number
  models: Record<string, AgentOption>
  options: Record<string, { models: string[]; efforts: string[] }>
}

// 폼이 다루는 값만 모은 모양. 서버 응답과 현재 입력을 같은 모양으로 맞춰 비교한다.
interface Form {
  dir: string
  timeoutSec: string
  models: Record<string, AgentOption>
}

const inputClass = 'rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900'

export default function Settings() {
  const [form, setForm] = useState<Form>({ dir: '', timeoutSec: '', models: {} })
  const [loaded, setLoaded] = useState<Form | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [options, setOptions] = useState<SettingsResponse['options']>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function apply(data: SettingsResponse) {
    const next: Form = {
      dir: data.dir,
      timeoutSec: String(Math.round(data.timeoutMs / 1000)),
      models: data.models,
    }
    setForm(next)
    setLoaded(next)
    setSource(data.source)
    setOptions(data.options)
  }

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then(apply)
      .catch(() => setError('현재 설정을 불러올 수 없습니다'))
  }, [])

  // ponytail: JSON.stringify 비교. 키 순서가 코드로 고정돼 있어 성립한다. 폼이 커지면 항목별 비교.
  const dirty = loaded !== null && JSON.stringify(form) !== JSON.stringify(loaded)

  function update(patch: Partial<Form>) {
    setForm({ ...form, ...patch })
    setSaved(false)
  }

  async function handleSave() {
    if (!loaded || !dirty) return
    // 바뀐 항목만 보낸다. 서버는 body에 있는 키만 반영한다.
    const patch: Record<string, unknown> = {}
    if (form.dir !== loaded.dir) patch.dataDir = form.dir.trim() || null
    if (form.timeoutSec !== loaded.timeoutSec) patch.timeoutMs = Number(form.timeoutSec) * 1000
    if (JSON.stringify(form.models) !== JSON.stringify(loaded.models)) patch.models = form.models

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const body = await res.json()
      if (!res.ok) setError(body.error ?? '저장할 수 없습니다')
      else {
        apply(body)
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
        변경한 값은 재시작 없이 적용됩니다. 모델·타임아웃은 다음 실행부터 반영됩니다.
      </p>

      <div className="space-y-10">
        <section>
          <label className="mb-1 block text-sm font-medium">작업 결과 저장 위치</label>
          <input
            type="text"
            value={form.dir}
            onChange={(e) => update({ dir: e.target.value })}
            placeholder="/Users/me/multi-data"
            className={`w-full font-mono ${inputClass}`}
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            절대 경로만 사용할 수 있습니다. 작업은 이 경로 아래 <code>tasks/</code>에 저장됩니다.
            {source && ` 현재 출처: ${SOURCE_LABEL[source] ?? source}.`}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            위치를 바꾸면 이전 위치에 있던 작업은 목록에 보이지 않습니다 (파일은 그대로 남습니다). 비우고 저장하면
            기본값(환경변수 또는 <code>./.data</code>)으로 돌아갑니다.
          </p>
          <button
            type="button"
            disabled={saving || source !== 'settings'}
            onClick={() => update({ dir: '' })}
            className="mt-3 rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            입력칸 비우기 (기본값으로)
          </button>
        </section>

        <section>
          <label className="mb-1 block text-sm font-medium">Agent 실행 타임아웃 (초)</label>
          <input
            type="number"
            min={10}
            max={3600}
            value={form.timeoutSec}
            onChange={(e) => update({ timeoutSec: e.target.value })}
            className={`w-32 ${inputClass}`}
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            10~3600초. 이 시간을 넘기면 해당 Agent의 실행을 중단하고 timeout으로 기록합니다.
          </p>
        </section>

        <section>
          <label className="mb-1 block text-sm font-medium">Agent 모델 / effort</label>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">목록은 비싼 모델부터 저렴한 모델 순입니다.</p>
          <div className="mt-2 space-y-3">
            {Object.entries(options).map(([id, spec]) => (
              <div key={id} className="flex items-center gap-2">
                <span className="w-20 text-sm capitalize">{id}</span>
                <select
                  value={form.models[id]?.model ?? ''}
                  onChange={(e) =>
                    update({ models: { ...form.models, [id]: { ...form.models[id], model: e.target.value } } })
                  }
                  className={inputClass}
                >
                  {spec.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={form.models[id]?.effort ?? ''}
                  onChange={(e) =>
                    update({ models: { ...form.models, [id]: { ...form.models[id], effort: e.target.value } } })
                  }
                  className={inputClass}
                >
                  {spec.efforts.map((eff) => (
                    <option key={eff} value={eff}>
                      {eff}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
        )}
        {saved && <p className="text-sm text-green-700 dark:text-green-400">저장했습니다.</p>}

        <button
          type="button"
          disabled={saving || !dirty}
          onClick={handleSave}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </main>
  )
}
