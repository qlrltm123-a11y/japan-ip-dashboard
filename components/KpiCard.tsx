"use client"

interface Props {
  label: string
  value: string
  sub?: string
}

export default function KpiCard({ label, value, sub }: Props) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs text-muted uppercase tracking-widest mb-1">{label}</div>
      <div className="text-2xl font-bold text-[#e2e2e8]">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  )
}
