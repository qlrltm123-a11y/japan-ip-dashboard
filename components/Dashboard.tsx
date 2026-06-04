"use client"

import { useMemo, useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from "recharts"
import type { Post } from "@/lib/fetchData"
import KpiCard from "./KpiCard"

const TYPE_COLORS: Record<string, string> = {
  "영상": "#6366f1",
  "캐러셀": "#f97316",
  "이미지": "#34d399",
}

function fmt(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`
  return n.toLocaleString()
}

type Tab = "overview" | "funnel" | "trend" | "top" | "raw"

export default function Dashboard({ posts }: { posts: Post[] }) {
  const [tab, setTab] = useState<Tab>("overview")
  const [sortBy, setSortBy] = useState<"comments" | "impressions" | "engagementRate">("comments")

  const totalImp = useMemo(() => posts.reduce((a, p) => a + p.impressions, 0), [posts])
  const totalComments = useMemo(() => posts.reduce((a, p) => a + p.comments, 0), [posts])
  const avgEng = totalImp > 0 ? ((totalComments / totalImp) * 100).toFixed(2) : "0"

  // 콘텐츠 유형별 집계
  const byType = useMemo(() => {
    const map: Record<string, { impressions: number; comments: number; count: number }> = {}
    for (const p of posts) {
      if (!map[p.contentType]) map[p.contentType] = { impressions: 0, comments: 0, count: 0 }
      map[p.contentType].impressions += p.impressions
      map[p.contentType].comments += p.comments
      map[p.contentType].count++
    }
    return Object.entries(map).map(([type, v]) => ({
      type,
      impressions: v.impressions,
      comments: v.comments,
      engRate: v.impressions > 0 ? +((v.comments / v.impressions) * 100).toFixed(2) : 0,
      count: v.count,
    })).sort((a, b) => b.count - a.count)
  }, [posts])

  // IP별 집계
  const byIP = useMemo(() => {
    const map: Record<string, { comments: number; count: number }> = {}
    for (const p of posts) {
      if (!map[p.ipName]) map[p.ipName] = { comments: 0, count: 0 }
      map[p.ipName].comments += p.comments
      map[p.ipName].count++
    }
    return Object.entries(map)
      .map(([ip, v]) => ({ ip, comments: v.comments, count: v.count }))
      .sort((a, b) => b.count - a.count)
  }, [posts])

  // 날짜별 트렌드
  const byDate = useMemo(() => {
    const map: Record<string, { impressions: number; comments: number; count: number }> = {}
    for (const p of posts) {
      const d = p.date.slice(0, 10)
      if (!map[d]) map[d] = { impressions: 0, comments: 0, count: 0 }
      map[d].impressions += p.impressions
      map[d].comments += p.comments
      map[d].count++
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: date.slice(5),
        게시물수: v.count,
        댓글수: v.comments,
      }))
  }, [posts])

  // 해시태그 집계
  const byHashtag = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of posts) {
      for (const h of p.hashtags) {
        map[h] = (map[h] ?? 0) + 1
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }))
  }, [posts])

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
        <p className="text-muted text-sm mt-1">
          Instagram 해시태그 수집 기준 · 총 {posts.length}건 · 5분마다 자동 갱신
        </p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="총 게시물" value={`${posts.length}건`} sub={`오늘 ${posts.filter(p => p.date === new Date().toISOString().slice(0,10)).length}건`} />
        <KpiCard label="총 댓글수" value={fmt(totalComments)} sub="반응 지표" />
        <KpiCard label="콘텐츠 유형" value={`${byType.length}종`} sub={byType.map(t => `${t.type} ${t.count}`).join(" / ")} />
        <KpiCard label="추적 해시태그" value={`${byHashtag.length}개`} sub={byHashtag.slice(0,2).map(h=>h.tag).join(", ")} />
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
            {/* 콘텐츠 유형별 게시물 수 */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">콘텐츠 유형별 게시물 수</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byType}>
                  <XAxis dataKey="type" stroke="#888" fontSize={12} />
                  <YAxis stroke="#888" fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="게시물수" radius={[6,6,0,0]}>
                    {byType.map((entry, i) => (
                      <Cell key={i} fill={TYPE_COLORS[entry.type] ?? "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 해시태그 TOP 15 */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">해시태그 TOP 15</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byHashtag} layout="vertical">
                  <XAxis type="number" stroke="#888" fontSize={11} />
                  <YAxis type="category" dataKey="tag" stroke="#888" fontSize={10} width={100} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="게시물수" fill="#6366f1" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* IP별 집계 */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">IP / 카테고리별 게시물 수</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byIP}>
                <XAxis dataKey="ip" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="게시물수" fill="#f97316" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 요약 테이블 */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">유형별 요약</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">유형</th>
                  <th className="text-right py-2">게시물 수</th>
                  <th className="text-right py-2">총 댓글</th>
                  <th className="text-right py-2">게시물당 댓글</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((row) => (
                  <tr key={row.type} className="border-b border-border">
                    <td className="py-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: TYPE_COLORS[row.type] ?? "#6366f1" }} />
                      {row.type}
                    </td>
                    <td className="text-right py-2">{row.count}</td>
                    <td className="text-right py-2">{fmt(row.comments)}</td>
                    <td className="text-right py-2 text-[#6366f1] font-semibold">
                      {row.count > 0 ? (row.comments / row.count).toFixed(1) : 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: 퍼널 */}
      {tab === "funnel" && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-6 text-muted uppercase tracking-wide">콘텐츠 반응 퍼널</h3>
          <div className="space-y-4 max-w-xl mx-auto">
            {[
              { name: "수집된 게시물", value: posts.length, fill: "#6366f1", unit: "건" },
              { name: "댓글 있는 게시물", value: posts.filter(p => p.comments > 0).length, fill: "#818cf8", unit: "건" },
              { name: "총 댓글 반응", value: totalComments, fill: "#f97316", unit: "개" },
            ].map((step, i) => {
              const pct = i === 0 ? 100 : ((step.value / posts.length) * 100).toFixed(1)
              return (
                <div key={step.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{step.name}</span>
                    <span className="text-muted">{fmt(step.value)}{step.unit} ({pct}%)</span>
                  </div>
                  <div className="bg-border rounded-full h-10 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center pl-4 text-white text-xs font-bold"
                      style={{ width: `${Math.max(15, Number(pct))}%`, backgroundColor: step.fill }}
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
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">일별 게시물 · 댓글 추이</h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={byDate}>
              <XAxis dataKey="date" stroke="#888" fontSize={11} />
              <YAxis yAxisId="left" stroke="#888" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="#888" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="게시물수" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="댓글수" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tab: 상위 게시물 */}
      {tab === "top" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["comments", "impressions"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  sortBy === s ? "bg-[#6366f1] text-white" : "bg-surface border border-border text-muted"
                }`}
              >
                {s === "comments" ? "댓글 많은 순" : "추정 노출 순"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {topPosts.map((p, i) => (
              <a
                key={i}
                href={p.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-surface border border-border rounded-xl overflow-hidden hover:border-[#6366f1] transition-colors group"
              >
                {/* 썸네일 */}
                <div className="relative aspect-square bg-border overflow-hidden">
                  {p.displayUrl ? (
                    <img
                      src={p.displayUrl}
                      alt={p.caption.slice(0, 40)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted text-3xl">
                      {p.isVideo ? "▶" : "🖼"}
                    </div>
                  )}
                  {/* 콘텐츠 유형 뱃지 */}
                  <div className="absolute top-2 left-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "#0009", color: "#fff" }}>
                      {p.isVideo ? "▶ 영상" : p.contentType === "캐러셀" ? "⊞ 캐러셀" : "🖼 이미지"}
                    </span>
                  </div>
                  {/* 순위 */}
                  <div className="absolute top-2 right-2 w-6 h-6 bg-[#6366f1] rounded-full flex items-center justify-center text-xs font-bold text-white">
                    {i + 1}
                  </div>
                </div>

                {/* 정보 */}
                <div className="p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-semibold truncate">@{p.owner}</span>
                    {p.ownerFullName && (
                      <span className="text-xs text-muted truncate">· {p.ownerFullName}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted line-clamp-2 mb-2">{p.caption.slice(0, 80)}</p>
                  <div className="flex gap-1 flex-wrap mb-2">
                    {p.hashtags.slice(0, 3).map((h, j) => (
                      <span key={j} className="text-xs text-[#818cf8] truncate">{h}</span>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-muted border-t border-border pt-2 mt-1">
                    <span>💬 {p.comments}</span>
                    <span>{p.date.slice(5)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Tab: 원본 데이터 */}
      {tab === "raw" && (
        <div className="bg-surface border border-border rounded-xl overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border">
                {["날짜", "계정", "유형", "댓글", "해시태그", "링크"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.slice(0, 300).map((p, i) => (
                <tr key={i} className="border-b border-border hover:bg-border/30">
                  <td className="px-4 py-2 whitespace-nowrap">{p.date}</td>
                  <td className="px-4 py-2">@{p.owner}</td>
                  <td className="px-4 py-2">{p.contentType}</td>
                  <td className="px-4 py-2 text-right">{p.comments}</td>
                  <td className="px-4 py-2 max-w-[200px] truncate">{p.hashtags.join(" ")}</td>
                  <td className="px-4 py-2">
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="text-[#6366f1] hover:underline">↗</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
