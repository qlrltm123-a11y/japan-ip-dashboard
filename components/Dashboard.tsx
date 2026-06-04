"use client"

import { useMemo, useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, FunnelChart, Funnel, LabelList,
  Cell,
} from "recharts"
import type { Post } from "@/lib/fetchData"
import KpiCard from "./KpiCard"

const CHANNEL_COLORS: Record<string, string> = {
  "영상/릴스": "#6366f1",
  "이미지": "#f97316",
}

function fmt(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`
  return n.toLocaleString()
}

type Tab = "overview" | "funnel" | "trend" | "top" | "raw"

export default function Dashboard({ posts }: { posts: Post[] }) {
  const [tab, setTab] = useState<Tab>("overview")
  const [sortBy, setSortBy] = useState<"reactions" | "impressions" | "engagementRate">("reactions")

  const totalImp = useMemo(() => posts.reduce((a, p) => a + p.impressions, 0), [posts])
  const totalReach = useMemo(() => posts.reduce((a, p) => a + p.reach, 0), [posts])
  const totalReact = useMemo(() => posts.reduce((a, p) => a + p.reactions, 0), [posts])
  const avgEng = totalImp > 0 ? ((totalReact / totalImp) * 100).toFixed(2) : "0"
  const paidCount = posts.filter((p) => p.isPaid).length
  const paidRate = posts.length > 0 ? ((paidCount / posts.length) * 100).toFixed(1) : "0"

  // 콘텐츠 유형별 집계
  const byType = useMemo(() => {
    const map: Record<string, { impressions: number; reactions: number; count: number }> = {}
    for (const p of posts) {
      if (!map[p.contentType]) map[p.contentType] = { impressions: 0, reactions: 0, count: 0 }
      map[p.contentType].impressions += p.impressions
      map[p.contentType].reactions += p.reactions
      map[p.contentType].count++
    }
    return Object.entries(map).map(([type, v]) => ({
      type,
      impressions: v.impressions,
      reactions: v.reactions,
      engRate: v.impressions > 0 ? +((v.reactions / v.impressions) * 100).toFixed(2) : 0,
      count: v.count,
    }))
  }, [posts])

  // 날짜별 트렌드
  const byDate = useMemo(() => {
    const map: Record<string, { impressions: number; reactions: number; count: number }> = {}
    for (const p of posts) {
      const d = p.date.slice(0, 10)
      if (!map[d]) map[d] = { impressions: 0, reactions: 0, count: 0 }
      map[d].impressions += p.impressions
      map[d].reactions += p.reactions
      map[d].count++
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: date.slice(5),
        impressions: v.impressions,
        reactions: v.reactions,
        engRate: v.impressions > 0 ? +((v.reactions / v.impressions) * 100).toFixed(2) : 0,
      }))
  }, [posts])

  // 퍼널
  const funnelData = [
    { name: "노출", value: totalImp, fill: "#6366f1" },
    { name: "도달", value: totalReach, fill: "#818cf8" },
    { name: "반응", value: totalReact, fill: "#f97316" },
    { name: "좋아요", value: posts.reduce((a, p) => a + p.likes, 0), fill: "#fb923c" },
  ]

  // 상위 게시물
  const topPosts = useMemo(
    () => [...posts].sort((a, b) => b[sortBy] - a[sortBy]).slice(0, 20),
    [posts, sortBy]
  )

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "📊 성과 비교" },
    { id: "funnel", label: "🔁 퍼널" },
    { id: "trend", label: "📅 트렌드" },
    { id: "top", label: "🏆 상위 게시물" },
    { id: "raw", label: "📋 데이터" },
  ]

  const tooltipStyle = {
    backgroundColor: "#1a1a24",
    border: "1px solid #2a2a3a",
    color: "#e2e2e8",
    borderRadius: 8,
  }

  return (
    <div className="min-h-screen bg-bg text-[#e2e2e8] p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🇯🇵 일본 IP 콜라보 성과 대시보드</h1>
        <p className="text-muted text-sm mt-1">Instagram 해시태그 수집 기준 · 총 {posts.length}건 · 5분마다 자동 갱신</p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="총 노출수" value={fmt(totalImp)} sub={`도달 ${fmt(totalReach)}`} />
        <KpiCard label="평균 반응률" value={`${avgEng}%`} sub={`반응 ${fmt(totalReact)}건`} />
        <KpiCard label="총 게시물" value={`${posts.length}건`} sub={`영상 ${posts.filter(p=>p.isVideo).length} / 이미지 ${posts.filter(p=>!p.isVideo).length}`} />
        <KpiCard label="협찬 콘텐츠" value={`${paidRate}%`} sub={`${paidCount}건`} />
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-[#6366f1] text-white"
                : "bg-surface border border-border text-muted hover:text-[#e2e2e8]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: 성과 비교 */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">콘텐츠 유형별 반응률</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byType}>
                  <XAxis dataKey="type" stroke="#888" fontSize={12} />
                  <YAxis stroke="#888" fontSize={12} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "반응률"]} />
                  <Bar dataKey="engRate" radius={[6, 6, 0, 0]}>
                    {byType.map((entry, i) => (
                      <Cell key={i} fill={CHANNEL_COLORS[entry.type] ?? "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">콘텐츠 유형별 노출수</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byType}>
                  <XAxis dataKey="type" stroke="#888" fontSize={12} />
                  <YAxis stroke="#888" fontSize={12} tickFormatter={fmt} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v), "노출수"]} />
                  <Bar dataKey="impressions" radius={[6, 6, 0, 0]}>
                    {byType.map((entry, i) => (
                      <Cell key={i} fill={CHANNEL_COLORS[entry.type] ?? "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 요약 테이블 */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">유형별 요약</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">유형</th>
                  <th className="text-right py-2">게시물 수</th>
                  <th className="text-right py-2">노출수</th>
                  <th className="text-right py-2">반응수</th>
                  <th className="text-right py-2">반응률</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((row) => (
                  <tr key={row.type} className="border-b border-border">
                    <td className="py-2">{row.type}</td>
                    <td className="text-right py-2">{row.count}</td>
                    <td className="text-right py-2">{fmt(row.impressions)}</td>
                    <td className="text-right py-2">{fmt(row.reactions)}</td>
                    <td className="text-right py-2 text-[#6366f1] font-semibold">{row.engRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: 퍼널 */}
      {tab === "funnel" && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4 text-muted uppercase tracking-wide">노출 → 도달 → 반응 퍼널</h3>
          <div className="space-y-3">
            {funnelData.map((step, i) => {
              const pct = funnelData[0].value > 0 ? (step.value / funnelData[0].value * 100).toFixed(1) : "0"
              const width = `${Math.max(20, Number(pct))}%`
              return (
                <div key={step.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{step.name}</span>
                    <span className="text-muted">{fmt(step.value)} ({pct}%)</span>
                  </div>
                  <div className="bg-border rounded-full h-8 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center pl-3 text-white text-xs font-bold transition-all"
                      style={{ width, backgroundColor: step.fill }}
                    >
                      {step.name}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab: 트렌드 */}
      {tab === "trend" && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">일별 노출 · 반응 추이</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={byDate}>
                <XAxis dataKey="date" stroke="#888" fontSize={11} />
                <YAxis yAxisId="left" stroke="#888" fontSize={11} tickFormatter={fmt} />
                <YAxis yAxisId="right" orientation="right" stroke="#888" fontSize={11} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="#6366f1" strokeWidth={2} dot={false} name="노출수" />
                <Line yAxisId="left" type="monotone" dataKey="reactions" stroke="#f97316" strokeWidth={2} dot={false} name="반응수" />
                <Line yAxisId="right" type="monotone" dataKey="engRate" stroke="#34d399" strokeWidth={2} dot={false} name="반응률(%)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab: 상위 게시물 */}
      {tab === "top" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["reactions", "impressions", "engagementRate"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  sortBy === s ? "bg-[#6366f1] text-white" : "bg-surface border border-border text-muted"
                }`}
              >
                {s === "reactions" ? "반응수" : s === "impressions" ? "노출수" : "반응률"}
              </button>
            ))}
          </div>

          {topPosts.map((p, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#6366f1] font-bold">#{i + 1}</span>
                    <span className="text-sm font-semibold">@{p.owner}</span>
                    <span className="text-xs text-muted bg-border px-2 py-0.5 rounded">{p.contentType}</span>
                    {p.isPaid && <span className="text-xs text-[#34d399] bg-[#064e3b] px-2 py-0.5 rounded">협찬</span>}
                  </div>
                  <p className="text-xs text-muted truncate">{p.caption.slice(0, 100)}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {p.hashtags.slice(0, 4).map((h, j) => (
                      <span key={j} className="text-xs text-[#818cf8]">{h}</span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4 text-right shrink-0">
                  <div>
                    <div className="text-xs text-muted">노출</div>
                    <div className="text-sm font-semibold">{fmt(p.impressions)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">반응</div>
                    <div className="text-sm font-semibold">{fmt(p.reactions)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">반응률</div>
                    <div className="text-sm font-semibold text-[#6366f1]">{p.engagementRate}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">날짜</div>
                    <div className="text-sm">{p.date.slice(5)}</div>
                  </div>
                </div>
              </div>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#6366f1] mt-2 inline-block hover:underline">
                  게시물 보기 ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: 원본 데이터 */}
      {tab === "raw" && (
        <div className="bg-surface border border-border rounded-xl overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border">
                {["날짜", "계정", "유형", "노출수", "반응수", "반응률", "좋아요", "댓글", "협찬"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.slice(0, 200).map((p, i) => (
                <tr key={i} className="border-b border-border hover:bg-border/30">
                  <td className="px-4 py-2 whitespace-nowrap">{p.date.slice(0, 10)}</td>
                  <td className="px-4 py-2">@{p.owner}</td>
                  <td className="px-4 py-2">{p.contentType}</td>
                  <td className="px-4 py-2 text-right">{fmt(p.impressions)}</td>
                  <td className="px-4 py-2 text-right">{fmt(p.reactions)}</td>
                  <td className="px-4 py-2 text-right text-[#6366f1]">{p.engagementRate}%</td>
                  <td className="px-4 py-2 text-right">{p.likes.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{p.comments.toLocaleString()}</td>
                  <td className="px-4 py-2 text-center">{p.isPaid ? "✅" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
