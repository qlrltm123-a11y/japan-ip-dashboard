"use client"

import { useMemo, useState, useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from "recharts"
import type { Post } from "@/lib/fetchData"
import { CAMPAIGN_RULES } from "@/lib/fetchData"

// ── 색상 팔레트 ──────────────────────────────────────────────────────────────
const CAMPAIGN_COLORS = [
  "#6366f1", "#f97316", "#34d399", "#f59e0b", "#ec4899", "#14b8a6",
]
const TYPE_COLORS: Record<string, string> = {
  "영상": "#6366f1", "캐러셀": "#f97316", "이미지": "#34d399",
}

function fmt(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`
  return n.toLocaleString()
}

function getCampaignColor(name: string): string {
  const idx = CAMPAIGN_RULES.findIndex(r => r.name === name)
  return idx >= 0 ? CAMPAIGN_COLORS[idx % CAMPAIGN_COLORS.length] : "#6b7280"
}

const TOOLTIP_STYLE = {
  backgroundColor: "#16161d",
  border: "1px solid #2a2a3a",
  borderRadius: 10,
  color: "#e2e2e8",
  fontSize: 12,
}

type Tab = "overview" | "trend" | "top" | "raw"

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="relative bg-[#16161d] border border-[#2a2a3a] rounded-2xl p-5 overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: accent ?? "#6366f1" }} />
      <p className="text-[11px] font-semibold tracking-widest text-[#666] uppercase mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#f0f0f6]">{value}</p>
      {sub && <p className="text-[11px] text-[#555] mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold tracking-widest text-[#555] uppercase mb-4">{children}</h3>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#16161d] border border-[#2a2a3a] rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function Dashboard({ posts, fetchedAt }: { posts: Post[]; fetchedAt: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>("overview")
  const [selectedCampaign, setSelectedCampaign] = useState("전체")
  const [sortBy, setSortBy] = useState<"comments" | "impressions">("comments")

  const refresh = useCallback(() => {
    startTransition(() => { router.refresh() })
  }, [router])

  const allCampaigns = ["전체", ...CAMPAIGN_RULES.map(r => r.name), "기타_콜라보", "미분류"]
  const fp = selectedCampaign === "전체" ? posts : posts.filter(p => p.ipName === selectedCampaign)

  const totalComments = useMemo(() => fp.reduce((a, p) => a + p.comments, 0), [fp])

  const byType = useMemo(() => {
    const map: Record<string, { comments: number; count: number }> = {}
    for (const p of fp) {
      if (!map[p.contentType]) map[p.contentType] = { comments: 0, count: 0 }
      map[p.contentType].comments += p.comments
      map[p.contentType].count++
    }
    return Object.entries(map)
      .map(([type, v]) => ({ type, ...v, avg: v.count > 0 ? +(v.comments / v.count).toFixed(1) : 0 }))
      .sort((a, b) => b.count - a.count)
  }, [fp])

  const byCampaign = useMemo(() => {
    const map: Record<string, { comments: number; count: number }> = {}
    for (const p of fp) {
      if (!map[p.ipName]) map[p.ipName] = { comments: 0, count: 0 }
      map[p.ipName].comments += p.comments
      map[p.ipName].count++
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name: name.split("_").pop() ?? name, fullName: name, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [fp])

  const byDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of fp) {
      map[p.date] = (map[p.date] ?? 0) + 1
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), count }))
  }, [fp])

  const byHashtag = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of fp) {
      for (const h of p.hashtags) map[h] = (map[h] ?? 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }))
  }, [fp])

  const topPosts = useMemo(
    () => [...fp].sort((a, b) => b[sortBy] - a[sortBy]).slice(0, 20),
    [fp, sortBy]
  )

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "개요" },
    { id: "trend", label: "트렌드" },
    { id: "top", label: "게시물" },
    { id: "raw", label: "데이터" },
  ]

  return (
    <div className="min-h-screen" style={{ background: "#0c0c10", color: "#e2e2e8", fontFamily: "system-ui, sans-serif" }}>

      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-[#1e1e28]" style={{ background: "rgba(12,12,16,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🇯🇵</span>
            <div>
              <h1 className="text-sm font-bold text-[#f0f0f6] leading-none">일본 IP 콜라보 대시보드</h1>
              <p className="text-[10px] text-[#444] mt-0.5">Instagram · {posts.length}건 수집</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#444]">
              {fetchedAt} 기준
            </span>
            <button
              onClick={refresh}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: isPending ? "#1e1e28" : "#6366f1",
                color: isPending ? "#555" : "#fff",
                border: "1px solid " + (isPending ? "#2a2a3a" : "#6366f1"),
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className={isPending ? "animate-spin" : ""}>
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              {isPending ? "갱신 중..." : "시트 갱신"}
            </button>
          </div>
        </div>

        {/* 캠페인 필터 탭 */}
        <div className="max-w-7xl mx-auto px-6 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {allCampaigns.map((c) => {
            const count = c === "전체" ? posts.length : posts.filter(p => p.ipName === c).length
            const isActive = selectedCampaign === c
            const color = c === "전체" ? "#6366f1" : getCampaignColor(c)
            const label = c === "전체" ? "전체" : (c.split("_").pop() ?? c)
            return (
              <button key={c} onClick={() => setSelectedCampaign(c)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  background: isActive ? color + "22" : "transparent",
                  border: `1px solid ${isActive ? color : "#2a2a3a"}`,
                  color: isActive ? color : "#555",
                }}>
                {isActive && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
                {label}
                <span className="text-[10px] opacity-60">{count}</span>
              </button>
            )
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* ── KPI ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Kpi label="수집 게시물" value={`${fp.length}건`}
            sub={selectedCampaign === "전체" ? `전체 캠페인` : (selectedCampaign.split("_").pop() ?? "")}
            accent="#6366f1" />
          <Kpi label="총 댓글 반응" value={fmt(totalComments)}
            sub={`평균 ${fp.length > 0 ? (totalComments / fp.length).toFixed(1) : 0}개/게시물`}
            accent="#f97316" />
          <Kpi label="영상 비율" value={`${fp.length > 0 ? Math.round(fp.filter(p => p.isVideo).length / fp.length * 100) : 0}%`}
            sub={`영상 ${fp.filter(p => p.isVideo).length} / 이미지 ${fp.filter(p => !p.isVideo).length}`}
            accent="#34d399" />
          <Kpi label="캐러셀 비율" value={`${fp.length > 0 ? Math.round(fp.filter(p => p.contentType === "캐러셀").length / fp.length * 100) : 0}%`}
            sub={`${fp.filter(p => p.contentType === "캐러셀").length}건`}
            accent="#f59e0b" />
        </div>

        {/* ── 탭 ───────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 bg-[#16161d] border border-[#2a2a3a] rounded-2xl p-1 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-5 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: tab === t.id ? "#6366f1" : "transparent",
                color: tab === t.id ? "#fff" : "#555",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            Tab: 개요
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* 콘텐츠 유형 분포 */}
              <Card>
                <SectionTitle>콘텐츠 유형별 게시물 수</SectionTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byType} barSize={36}>
                    <XAxis dataKey="type" stroke="#333" tick={{ fill: "#666", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#333" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#ffffff08" }} />
                    <Bar dataKey="count" name="게시물" radius={[8, 8, 0, 0]}>
                      {byType.map((e, i) => <Cell key={i} fill={TYPE_COLORS[e.type] ?? "#6366f1"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* 해시태그 TOP 12 */}
              <Card>
                <SectionTitle>인기 해시태그 TOP 12</SectionTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byHashtag} layout="vertical" barSize={14}>
                    <XAxis type="number" stroke="#333" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="tag" stroke="#333" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#ffffff08" }} />
                    <Bar dataKey="count" name="게시물수" fill="#6366f1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* 캠페인별 비교 */}
            {selectedCampaign === "전체" && byCampaign.length > 1 && (
              <Card>
                <SectionTitle>캠페인별 게시물 수 비교</SectionTitle>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={byCampaign} barSize={40}>
                    <XAxis dataKey="name" stroke="#333" tick={{ fill: "#777", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#333" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#ffffff08" }} />
                    <Bar dataKey="count" name="게시물" radius={[8, 8, 0, 0]}>
                      {byCampaign.map((e, i) => <Cell key={i} fill={getCampaignColor(e.fullName)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* 요약 테이블 */}
            <Card>
              <SectionTitle>콘텐츠 유형 요약</SectionTitle>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a3a]">
                      {["유형", "게시물 수", "총 댓글", "평균 댓글/건"].map(h => (
                        <th key={h} className={`py-3 text-[11px] font-semibold text-[#555] uppercase tracking-wider ${h === "유형" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byType.map(row => (
                      <tr key={row.type} className="border-b border-[#1e1e28] hover:bg-[#ffffff04]">
                        <td className="py-3 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[row.type] ?? "#6366f1" }} />
                          <span className="text-sm text-[#ccc]">{row.type}</span>
                        </td>
                        <td className="py-3 text-right text-[#ccc]">{row.count.toLocaleString()}</td>
                        <td className="py-3 text-right text-[#ccc]">{fmt(row.comments)}</td>
                        <td className="py-3 text-right font-semibold" style={{ color: "#6366f1" }}>{row.avg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            Tab: 트렌드
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "trend" && (
          <div className="space-y-4">
            <Card>
              <SectionTitle>일별 게시물 수 추이</SectionTitle>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={byDate}>
                  <XAxis dataKey="date" stroke="#333" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#333" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "#6366f1", strokeWidth: 1, strokeDasharray: "4 2" }} />
                  <Line type="monotone" dataKey="count" name="게시물수" stroke="#6366f1" strokeWidth={2.5}
                    dot={{ fill: "#6366f1", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#818cf8", strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* 요일별 분포 */}
            <Card>
              <SectionTitle>요일별 게시물 분포</SectionTitle>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart barSize={32} data={(() => {
                  const days = ["일","월","화","수","목","금","토"]
                  const map: Record<string, number> = {}
                  days.forEach(d => map[d] = 0)
                  fp.forEach(p => {
                    const d = new Date(p.date)
                    if (!isNaN(d.getTime())) map[days[d.getDay()]] = (map[days[d.getDay()]] ?? 0) + 1
                  })
                  return days.map(d => ({ day: d, count: map[d] }))
                })()}>
                  <XAxis dataKey="day" stroke="#333" tick={{ fill: "#666", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#333" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#ffffff08" }} />
                  <Bar dataKey="count" name="게시물" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            Tab: 게시물 (썸네일 그리드)
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "top" && (
          <div>
            {/* 정렬 옵션 */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] text-[#555]">정렬:</span>
              {(["comments", "impressions"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    background: sortBy === s ? "#6366f122" : "transparent",
                    border: `1px solid ${sortBy === s ? "#6366f1" : "#2a2a3a"}`,
                    color: sortBy === s ? "#818cf8" : "#555",
                  }}>
                  {s === "comments" ? "💬 댓글 많은 순" : "👁 노출 순"}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-[#444]">상위 20건</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {topPosts.map((p, i) => (
                <a key={i} href={p.url || "#"} target="_blank" rel="noopener noreferrer"
                  className="group block rounded-2xl overflow-hidden border border-[#2a2a3a] hover:border-[#6366f1] transition-all hover:shadow-lg hover:shadow-[#6366f120]"
                  style={{ background: "#16161d" }}>

                  {/* 썸네일 */}
                  <div className="relative aspect-square bg-[#1e1e28] overflow-hidden">
                    {p.displayUrl ? (
                      <img src={p.displayUrl} alt="" loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={e => { (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-4xl">${p.isVideo ? "▶" : "🖼"}</div>` }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl text-[#333]">
                        {p.isVideo ? "▶" : "🖼"}
                      </div>
                    )}

                    {/* 오버레이 그라디언트 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* 순위 뱃지 */}
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: i < 3 ? "#f59e0b" : "#6366f1" }}>
                      {i + 1}
                    </div>

                    {/* 콘텐츠 유형 */}
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                      style={{ background: "#00000088", color: "#fff" }}>
                      {p.isVideo ? "▶" : p.contentType === "캐러셀" ? "⊞" : "◻"}
                    </div>

                    {/* 캠페인 배지 */}
                    {p.ipName !== "미분류" && p.ipName !== "기타_콜라보" && (
                      <div className="absolute bottom-2 left-2 right-2 truncate px-2 py-0.5 rounded-md text-[9px] font-bold"
                        style={{ background: getCampaignColor(p.ipName) + "cc", color: "#fff" }}>
                        {p.ipName.split("_").pop()}
                      </div>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="p-3">
                    <p className="text-[11px] font-semibold text-[#ccc] truncate">@{p.owner}</p>
                    <p className="text-[10px] text-[#555] line-clamp-2 mt-0.5 leading-relaxed">
                      {p.caption.slice(0, 60)}
                    </p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {p.hashtags.slice(0, 2).map((h, j) => (
                        <span key={j} className="text-[9px] text-[#6366f1] truncate max-w-[80px]">{h}</span>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#1e1e28]">
                      <span className="text-[10px] text-[#666]">💬 {p.comments}</span>
                      <span className="text-[10px] text-[#444]">{p.date.slice(5)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            Tab: 데이터
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "raw" && (
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
              <SectionTitle>원본 데이터 ({fp.length}건)</SectionTitle>
            </div>
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ background: "#16161d" }}>
                  <tr className="border-b border-[#2a2a3a]">
                    {["날짜", "캠페인", "계정", "유형", "댓글", "해시태그", "링크"].map(h => (
                      <th key={h} className={`px-4 py-3 text-[10px] font-bold tracking-widest text-[#444] uppercase whitespace-nowrap ${h === "댓글" || h === "링크" ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fp.slice(0, 300).map((p, i) => (
                    <tr key={i} className="border-b border-[#1a1a22] hover:bg-[#ffffff03] transition-colors">
                      <td className="px-4 py-2.5 text-[#666] whitespace-nowrap">{p.date}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: getCampaignColor(p.ipName) + "22", color: getCampaignColor(p.ipName) }}>
                          {p.ipName.split("_").pop()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#aaa] font-medium">@{p.owner}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: (TYPE_COLORS[p.contentType] ?? "#6b7280") + "22", color: TYPE_COLORS[p.contentType] ?? "#888" }}>
                          {p.contentType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-[#888]">{p.comments}</td>
                      <td className="px-4 py-2.5 max-w-[180px] truncate text-[#555]">{p.hashtags.slice(0, 3).join(" ")}</td>
                      <td className="px-4 py-2.5 text-center">
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#6366f122] text-[#6366f1] hover:bg-[#6366f133] transition-colors">
                            ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}
