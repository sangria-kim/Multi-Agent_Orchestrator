import { compareSections, extractHeadings } from '@/lib/sections'

export function SectionCompareTable({ labels, contents }: { labels: string[]; contents: string[] }) {
  const headingLists = contents.map(extractHeadings)
  const rows = compareSections(headingLists)

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">비교할 헤딩이 없습니다.</p>
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-zinc-300 dark:border-zinc-700">
          <th className="py-2 pr-4 text-left font-medium">섹션</th>
          {labels.map((label) => (
            <th key={label} className="py-2 pr-4 text-left font-medium capitalize">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.heading} className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
            <td className="py-2 pr-4">{row.heading}</td>
            {row.present.map((present, i) => (
              <td key={i} className="py-2 pr-4">
                {present ? '✓' : '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
