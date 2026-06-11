"use client"

import { useMemo, useState, useCallback, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from "recharts"
import type { Post } from "@/lib/fetchData"
import { CAMPAIGN_RULES, isCampaignPost, getCampaignLabel } from "@/lib/fetchData"

// ── 색상 팔레트 ──────────────────────────────────────────────────────────────
const CAMPAIGN_COLORS = [
  "#6366f1", "#f97316", "#34d399", "#f59e0b", "#ec4899", "#14b8a6",
]
const TYPE_COLORS: Record<string, string> = {
  "영상": "#6366f1", "캐러셀": "#f97316", "이미지": "#34d399",
}
const CHANNEL_COLORS: Record<string, string> = {
  "Instagram": "#e1306c",
  "TikTok": "#69c9d0",
  "YouTube": "#ff0000",
}
const CHANNEL_LABELS: Record<string, string> = {
  "Instagram": "IG",
  "TikTok": "TT",
  "YouTube": "YT",
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
  backgroundColor: "#ffffff",
  border: "1px solid #dcdfeb",
  borderRadius: 10,
  color: "#2c2d3d",
  fontSize: 12,
}

type Tab = "overview" | "compare" | "trend" | "top" | "reaction" | "raw"

// 브랜드별 이전 콜라보 vs 이번 콜라보 비교 매핑
const BRAND_COMPARISONS: { brand: string; prevName: string; currName: string }[] = [
  { brand: "wakemake",  prevName: "wakemake_ハローキティブラックエディション", currName: "wakemake_平成ギャルエディション" },
  { brand: "colorgram", prevName: "colorgram_クレヨンしんちゃんコラボ",        currName: "colorgram_ギャルしんちゃんコラボ" },
]

const SENTIMENT_COLORS: Record<string, string> = {
  "구매의도": "#34d399",
  "긍정":     "#6366f1",
  "중립":     "#6b7280",
  "부정":     "#f87171",
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="relative bg-[#ffffff] border border-[#dcdfeb] rounded-2xl p-5 overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: accent ?? "#6366f1" }} />
      <p className="text-[11px] font-semibold tracking-widest text-[#6b6c80] uppercase mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#1a1b26]">{value}</p>
      {sub && <p className="text-[11px] text-[#8a8ba0] mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold tracking-widest text-[#8a8ba0] uppercase mb-4">{children}</h3>
  )
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#ffffff] border border-[#dcdfeb] rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  )
}

// 이전 vs 이번 지표 막대 비교 (단위가 서로 다른 지표를 한 차트 없이 비교)
function MetricCompareRow({ label, prevVal, currVal, prevColor, currColor, format, change }: {
  label: string; prevVal: number; currVal: number; prevColor: string; currColor: string
  format: (n: number) => string; change: number | null
}) {
  const max = Math.max(prevVal, currVal, 1)
  return (
    <div>
      <div className="flex justify-between items-center text-[11px] mb-1.5">
        <span className="font-bold text-[#6b6c80]">{label}</span>
        {change !== null && (
          <span className="font-bold" style={{ color: change >= 0 ? "#34d399" : "#f87171" }}>
            {change >= 0 ? "+" : ""}{change}%
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {[
          { val: prevVal, color: prevColor },
          { val: currVal, color: currColor },
        ].map(({ val, color }, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden bg-[#eef0f5]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(val / max * 100, val > 0 ? 3 : 0)}%`, background: color }} />
            </div>
            <span className="text-[10px] w-14 text-right font-semibold text-[#1a1b26]">{format(val)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function Dashboard({ posts, allPosts, fetchedAt }: { posts: Post[]; allPosts: Post[]; fetchedAt: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>("overview")
  const [selectedCampaign, setSelectedCampaign] = useState("전체")
  const [selectedChannel, setSelectedChannel] = useState<"전체" | "Instagram" | "TikTok" | "YouTube">("전체")
  const [selectedBrand, setSelectedBrand] = useState<"전체" | "wakemake" | "colorgram">("전체")
  const [sortBy, setSortBy] = useState<"reactions" | "plays" | "comments">("reactions")
  const [showAllPosts, setShowAllPosts] = useState(false)
  const [jpOnly, setJpOnly] = useState(true)

  const basePosts = jpOnly ? posts : allPosts

  const refresh = useCallback(() => {
    startTransition(() => { router.refresh() })
  }, [router])

  const brandFiltered = useMemo(() =>
    basePosts.filter(p => selectedBrand === "전체" || p.ipName.startsWith(selectedBrand + "_")),
  [basePosts, selectedBrand])

  const igCount = brandFiltered.filter(p => p.channel === "Instagram").length
  const ttCount = brandFiltered.filter(p => p.channel === "TikTok").length
  const ytCount = brandFiltered.filter(p => p.channel === "YouTube").length
  // 캠페인 모드: 정의된 캠페인만 / 전체 모드: 미분류 포함
  const allCampaigns = (jpOnly
    ? ["전체", ...CAMPAIGN_RULES.map(r => r.name)]
    : ["전체", ...CAMPAIGN_RULES.map(r => r.name), "기타_콜라보", "미분류"]
  ).filter(c => c === "전체" || selectedBrand === "전체" || c.startsWith(selectedBrand + "_"))

  // 브랜드 변경 시 더 이상 유효하지 않은 캠페인 선택 초기화
  useEffect(() => {
    if (selectedCampaign !== "전체" && !allCampaigns.includes(selectedCampaign)) {
      setSelectedCampaign("전체")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand])

  const fp = useMemo(() => brandFiltered
    .filter(p => selectedCampaign === "전체" || p.ipName === selectedCampaign)
    .filter(p => selectedChannel === "전체" || p.channel === selectedChannel),
  [brandFiltered, selectedCampaign, selectedChannel])

  const totalComments  = useMemo(() => fp.reduce((a, p) => a + p.comments, 0), [fp])
  const totalPlays     = useMemo(() => fp.reduce((a, p) => a + p.plays, 0), [fp])
  const totalLikes     = useMemo(() => fp.reduce((a, p) => a + p.likes, 0), [fp])
  const totalReactions = useMemo(() => fp.reduce((a, p) => a + p.reactions, 0), [fp])

  const byType = useMemo(() => {
    const map: Record<string, { reactions: number; likes: number; comments: number; count: number }> = {}
    for (const p of fp) {
      if (!map[p.contentType]) map[p.contentType] = { reactions: 0, likes: 0, comments: 0, count: 0 }
      map[p.contentType].reactions += p.reactions
      map[p.contentType].likes += p.likes
      map[p.contentType].comments += p.comments
      map[p.contentType].count++
    }
    return Object.entries(map)
      .map(([type, v]) => ({
        type,
        ...v,
        avgReactions: v.count > 0 ? Math.round(v.reactions / v.count) : 0,
        avgLikes: v.count > 0 ? Math.round(v.likes / v.count) : 0,
      }))
      .sort((a, b) => b.avgReactions - a.avgReactions)
  }, [fp])

  const byCampaign = useMemo(() => {
    const map: Record<string, { reactions: number; likes: number; comments: number; plays: number; count: number; minDate: string; maxDate: string }> = {}
    for (const p of fp) {
      if (!map[p.ipName]) map[p.ipName] = { reactions: 0, likes: 0, comments: 0, plays: 0, count: 0, minDate: p.date, maxDate: p.date }
      map[p.ipName].reactions += p.reactions
      map[p.ipName].likes += p.likes
      map[p.ipName].comments += p.comments
      map[p.ipName].plays += p.plays
      map[p.ipName].count++
      if (p.date < map[p.ipName].minDate) map[p.ipName].minDate = p.date
      if (p.date > map[p.ipName].maxDate) map[p.ipName].maxDate = p.date
    }
    return Object.entries(map)
      .map(([name, v]) => ({
        name: getCampaignLabel(name),
        fullName: name,
        ...v,
        avgReactions: v.count > 0 ? Math.round(v.reactions / v.count) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [fp])

  const byDate = useMemo(() => {
    const map: Record<string, { count: number; reactions: number }> = {}
    for (const p of fp) {
      if (!map[p.date]) map[p.date] = { count: 0, reactions: 0 }
      map[p.date].count++
      map[p.date].reactions += p.reactions
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: date.slice(5), ...v }))
  }, [fp])

  // 버즈 모멘텀: 최근 7일 vs 이전 7일
  const momentum = useMemo(() => {
    const sorted = [...fp].sort((a, b) => b.date.localeCompare(a.date))
    const recent7 = sorted.filter((_, i) => i < Math.ceil(sorted.length / 2))
    const prev7   = sorted.filter((_, i) => i >= Math.ceil(sorted.length / 2))
    const recentAvg = recent7.length > 0 ? recent7.reduce((a, p) => a + p.reactions, 0) / recent7.length : 0
    const prevAvg   = prev7.length   > 0 ? prev7.reduce((a, p) => a + p.reactions, 0) / prev7.length   : 0
    const change = prevAvg > 0 ? Math.round((recentAvg - prevAvg) / prevAvg * 100) : 0
    return { recentAvg: Math.round(recentAvg), prevAvg: Math.round(prevAvg), change }
  }, [fp])

  // 상위 기여 계정 TOP 8
  const topAccounts = useMemo(() => {
    const map: Record<string, { reactions: number; likes: number; count: number; channel: string }> = {}
    for (const p of fp) {
      const key = `${p.channel}::${p.owner}`
      if (!map[key]) map[key] = { reactions: 0, likes: 0, count: 0, channel: p.channel }
      map[key].reactions += p.reactions
      map[key].likes += p.likes
      map[key].count++
    }
    return Object.entries(map)
      .map(([key, v]) => ({ owner: key.split("::")[1], ...v }))
      .sort((a, b) => b.reactions - a.reactions)
      .slice(0, 8)
  }, [fp])

  // 해시태그 수 구간별 평균 반응
  const hashtagImpact = useMemo(() => {
    const buckets: Record<string, number[]> = { "1~3개": [], "4~6개": [], "7~9개": [], "10개+": [] }
    fp.forEach(p => {
      const n = p.hashtags.length
      const bucket = n <= 3 ? "1~3개" : n <= 6 ? "4~6개" : n <= 9 ? "7~9개" : "10개+"
      buckets[bucket].push(p.reactions)
    })
    return Object.entries(buckets).map(([bucket, vals]) => ({
      bucket,
      avg: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
      count: vals.length,
    }))
  }, [fp])

  const byHashtag = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of fp) {
      for (const h of p.hashtags) map[h] = (map[h] ?? 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }))
  }, [fp])

  const sortedPosts = useMemo(
    () => [...fp].sort((a, b) => b[sortBy] - a[sortBy]),
    [fp, sortBy]
  )
  const topPosts = useMemo(
    () => showAllPosts ? sortedPosts : sortedPosts.slice(0, 20),
    [sortedPosts, showAllPosts]
  )

  // 감성 분포
  const sentimentDist = useMemo(() => {
    const map: Record<string, number> = { "구매의도": 0, "긍정": 0, "중립": 0, "부정": 0 }
    fp.forEach(p => { map[p.sentiment] = (map[p.sentiment] ?? 0) + 1 })
    return Object.entries(map).map(([s, count]) => ({ s, count, pct: fp.length > 0 ? Math.round(count / fp.length * 100) : 0 }))
  }, [fp])

  // 반응 키워드 빈도
  const topKeywords = useMemo(() => {
    const map: Record<string, number> = {}
    fp.forEach(p => p.sentimentKeywords.forEach(kw => { map[kw] = (map[kw] ?? 0) + 1 }))
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([kw, count]) => ({ kw, count }))
  }, [fp])

  // 댓글 있는 게시물 — 채널 필터 무관하게 IG 전체에서 가져옴
  const postsWithComments = useMemo(() =>
    brandFiltered
      .filter(p => selectedCampaign === "전체" || p.ipName === selectedCampaign)
      .filter(p => p.firstComment && p.firstComment.trim().length > 3)
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 30),
  [brandFiltered, selectedCampaign])

  // 채널 필터만 적용한 비교용 모집단 (캠페인 필터와 무관하게 이전/이번을 동시에 비교)
  const compareBase = useMemo(() =>
    brandFiltered.filter(p => selectedChannel === "전체" || p.channel === selectedChannel),
  [brandFiltered, selectedChannel])

  // 이전 vs 이번 콜라보 댓글 감성 비교 (채널 필터만 적용, 캠페인 필터 무관)
  const sentimentCompare = useMemo(() => {
    const SENTIMENTS = ["구매의도", "긍정", "중립", "부정"] as const
    const calcSentiment = (name: string) => {
      const ps = compareBase.filter(p => p.ipName === name)
      const total = ps.length
      const map: Record<string, number> = { "구매의도": 0, "긍정": 0, "중립": 0, "부정": 0 }
      ps.forEach(p => { map[p.sentiment] = (map[p.sentiment] ?? 0) + 1 })
      return { total, dist: SENTIMENTS.map(s => ({ s, count: map[s], pct: total > 0 ? Math.round(map[s] / total * 100) : 0 })) }
    }
    const calcKeywords = (name: string) => {
      const ps = compareBase.filter(p => p.ipName === name)
      const map: Record<string, number> = {}
      ps.forEach(p => p.sentimentKeywords.forEach(kw => { map[kw] = (map[kw] ?? 0) + 1 }))
      return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([kw, count]) => ({ kw, count }))
    }
    const calcTopComments = (name: string) =>
      compareBase
        .filter(p => p.ipName === name)
        .filter(p => p.firstComment && p.firstComment.trim().length > 3)
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 3)
    return BRAND_COMPARISONS
      .filter(({ brand }) => selectedBrand === "전체" || brand === selectedBrand)
      .map(({ brand, prevName, currName }) => {
        const prev = calcSentiment(prevName)
        const curr = calcSentiment(currName)
        const chartData = SENTIMENTS.map((s, i) => ({
          s, 이전: prev.dist[i].pct, 이번: curr.dist[i].pct,
        }))
        return {
          brand, prevName, currName,
          prevTotal: prev.total, currTotal: curr.total,
          chartData,
          prevKeywords: calcKeywords(prevName),
          currKeywords: calcKeywords(currName),
          prevTopComments: calcTopComments(prevName),
          currTopComments: calcTopComments(currName),
        }
      })
  }, [compareBase, selectedBrand])

  const brandStats = useMemo(() => {
    const calc = (name: string) => {
      const ps = compareBase.filter(p => p.ipName === name)
      const reactions = ps.reduce((a, p) => a + p.reactions, 0)
      const likes     = ps.reduce((a, p) => a + p.likes, 0)
      const comments  = ps.reduce((a, p) => a + p.comments, 0)
      const plays     = ps.reduce((a, p) => a + p.plays, 0)
      const shares    = ps.reduce((a, p) => a + p.shares, 0)
      const engagementSum = ps.reduce((a, p) => a + p.engagementRate, 0)
      const count = ps.length
      const dates = ps.map(p => p.date).sort()
      return {
        name,
        count, reactions, likes, comments, plays, shares,
        avgReactions: count > 0 ? Math.round(reactions / count) : 0,
        avgLikes: count > 0 ? Math.round(likes / count) : 0,
        avgComments: count > 0 ? +(comments / count).toFixed(1) : 0,
        avgPlays: count > 0 ? Math.round(plays / count) : 0,
        avgShares: count > 0 ? +(shares / count).toFixed(1) : 0,
        avgEngagement: count > 0 ? +(engagementSum / count).toFixed(2) : 0,
        minDate: dates[0] ?? "-",
        maxDate: dates[dates.length - 1] ?? "-",
      }
    }
    const pctChange = (prevVal: number, currVal: number) =>
      prevVal > 0 ? Math.round((currVal - prevVal) / prevVal * 100) : null

    return BRAND_COMPARISONS
      .filter(({ brand }) => selectedBrand === "전체" || brand === selectedBrand)
      .map(({ brand, prevName, currName }) => {
        const prev = calc(prevName)
        const curr = calc(currName)
        const change = pctChange(prev.avgReactions, curr.avgReactions)
        const countChange = pctChange(prev.count, curr.count)
        return {
          brand, prev, curr, change, countChange,
          likesChange:      pctChange(prev.avgLikes, curr.avgLikes),
          commentsChange:   pctChange(prev.avgComments, curr.avgComments),
          playsChange:      pctChange(prev.avgPlays, curr.avgPlays),
          engagementChange: pctChange(prev.avgEngagement, curr.avgEngagement),
        }
      })
  }, [compareBase, selectedBrand])

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview",  label: "개요" },
    { id: "compare",   label: "🆚 콜라보 비교" },
    { id: "trend",     label: "트렌드" },
    { id: "top",       label: "게시물" },
    { id: "reaction",  label: "💬 댓글 반응" },
    { id: "raw",       label: "데이터" },
  ]

  return (
    <div className="min-h-screen" style={{ background: "#f4f5f9", color: "#2c2d3d", fontFamily: "system-ui, sans-serif" }}>

      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-[#dcdfeb]" style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🇯🇵</span>
            <div>
              <h1 className="text-sm font-bold text-[#1a1b26] leading-none">일본 IP 콜라보 대시보드</h1>
              <p className="text-[10px] text-[#8a8ba0] mt-0.5">Instagram · TikTok · YouTube · {brandFiltered.length}건 수집</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* 브랜드 선택 */}
            {(["전체", "wakemake", "colorgram"] as const).map(b => {
              const isActive = selectedBrand === b
              return (
                <button key={b} onClick={() => setSelectedBrand(b)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border"
                  style={{
                    background: isActive ? "#e0e7ff" : "#eef0f5",
                    borderColor: isActive ? "#6366f1" : "#dcdfeb",
                    color: isActive ? "#4338ca" : "#8a8ba0",
                  }}>
                  {b === "전체" ? "🏷️ 전체" : b === "wakemake" ? "💄 wakemake" : "🎨 colorgram"}
                </button>
              )
            })}
            {/* 캠페인 매칭 필터 토글 */}
            <button onClick={() => setJpOnly(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border"
              style={{
                background: jpOnly ? "#e0e7ff" : "#eef0f5",
                borderColor: jpOnly ? "#6366f155" : "#dcdfeb",
                color: jpOnly ? "#4f46e5" : "#8a8ba0",
              }}>
              🎯 {jpOnly ? (
                <>캠페인 <span style={{color:"#34d399"}}>확정 {brandFiltered.length}</span></>
              ) : `일본어 전체 (${allPosts.length})`}
            </button>
            <span className="text-[11px] text-[#8a8ba0]">
              {fetchedAt}
            </span>
            <button
              onClick={refresh}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: isPending ? "#eef0f5" : "#6366f1",
                color: isPending ? "#8a8ba0" : "#fff",
                border: "1px solid " + (isPending ? "#dcdfeb" : "#6366f1"),
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

        {/* 채널 선택 */}
        <div className="max-w-7xl mx-auto px-6 pb-2 flex gap-2">
          {(["전체", "Instagram", "TikTok", "YouTube"] as const).map(ch => {
            const count = ch === "전체" ? brandFiltered.length : ch === "Instagram" ? igCount : ch === "TikTok" ? ttCount : ytCount
            const color = ch === "전체" ? "#6366f1" : CHANNEL_COLORS[ch]
            const isActive = selectedChannel === ch
            return (
              <button key={ch} onClick={() => setSelectedChannel(ch)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{
                  background: isActive ? color : "#eef0f5",
                  color: isActive ? "#fff" : "#6b6c80",
                  border: `1px solid ${isActive ? color : "#dcdfeb"}`,
                }}>
                {ch === "Instagram" ? "📸" : ch === "TikTok" ? "🎵" : ch === "YouTube" ? "▶️" : "🌐"} {ch}
                <span className="opacity-70 text-[10px]">{count}</span>
              </button>
            )
          })}
        </div>

        {/* 캠페인 필터 탭 */}
        <div className="max-w-7xl mx-auto px-6 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {allCampaigns.map((c) => {
            const count = c === "전체" ? brandFiltered.length : brandFiltered.filter(p => p.ipName === c).length
            const isActive = selectedCampaign === c
            const color = c === "전체" ? "#6366f1" : getCampaignColor(c)
            const label = c === "전체" ? "전체" : getCampaignLabel(c)
            return (
              <button key={c} onClick={() => setSelectedCampaign(c)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  background: isActive ? color + "22" : "transparent",
                  border: `1px solid ${isActive ? color : "#dcdfeb"}`,
                  color: isActive ? color : "#8a8ba0",
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
            sub={`IG ${fp.filter(p=>p.channel==="Instagram").length} / TT ${fp.filter(p=>p.channel==="TikTok").length} / YT ${fp.filter(p=>p.channel==="YouTube").length}`}
            accent="#6366f1" />
          {selectedChannel === "TikTok" || selectedChannel === "YouTube" ? (
            <Kpi label="총 재생수" value={fmt(totalPlays)}
              sub={`평균 ${fp.length > 0 ? fmt(Math.round(totalPlays/fp.length)) : 0}/건`}
              accent="#69c9d0" />
          ) : (
            <Kpi label="총 댓글" value={fmt(totalComments)}
              sub={`평균 ${fp.length > 0 ? (totalComments/fp.length).toFixed(1) : 0}개/건`}
              accent="#e1306c" />
          )}
          <Kpi label="총 좋아요" value={fmt(totalLikes)}
            sub={`평균 ${fp.length > 0 ? fmt(Math.round(totalLikes/fp.length)) : 0}/건`}
            accent="#f59e0b" />
          <Kpi label="총 반응수" value={fmt(totalReactions)}
            sub="댓글+좋아요+공유 합산"
            accent="#34d399" />
        </div>

        {/* ── 탭 ───────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 bg-[#ffffff] border border-[#dcdfeb] rounded-2xl p-1 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-5 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: tab === t.id ? "#6366f1" : "transparent",
                color: tab === t.id ? "#fff" : "#8a8ba0",
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

            {/* ① 버즈 모멘텀 배너 */}
            <div className="rounded-2xl p-5 border flex items-center justify-between gap-4 flex-wrap"
              style={{
                background: momentum.change >= 0 ? "#0d2e1a" : "#2e0d0d",
                borderColor: momentum.change >= 0 ? "#34d39933" : "#f8717133",
              }}>
              <div>
                <p className="text-[11px] font-bold tracking-widest uppercase mb-1"
                  style={{ color: momentum.change >= 0 ? "#34d399" : "#f87171" }}>
                  버즈 모멘텀 — {momentum.change >= 0 ? "📈 상승 중" : "📉 하락 중"}
                </p>
                <p className="text-2xl font-bold text-[#1a1b26]">
                  {momentum.change >= 0 ? "+" : ""}{momentum.change}%
                  <span className="text-sm font-normal text-[#6b6c80] ml-2">전반부 대비 후반부</span>
                </p>
              </div>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-[10px] text-[#8a8ba0] mb-0.5">전반부 평균 반응</p>
                  <p className="text-lg font-bold text-[#4b4c60]">{fmt(momentum.prevAvg)}</p>
                </div>
                <div className="w-px bg-[#dcdfeb]" />
                <div>
                  <p className="text-[10px] text-[#8a8ba0] mb-0.5">후반부 평균 반응</p>
                  <p className="text-lg font-bold" style={{ color: momentum.change >= 0 ? "#34d399" : "#f87171" }}>
                    {fmt(momentum.recentAvg)}
                  </p>
                </div>
              </div>
            </div>

            {/* ② 캠페인별 성과 비교 */}
            {byCampaign.length > 1 && (
              <Card>
                <SectionTitle>캠페인별 성과 비교</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byCampaign} barSize={36}>
                      <XAxis dataKey="name" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }}
                        formatter={(v: number) => [v.toLocaleString(), "게시물 수"]} />
                      <Bar dataKey="count" name="게시물 수" radius={[8,8,0,0]}>
                        {byCampaign.map((e, i) => <Cell key={i} fill={getCampaignColor(e.fullName)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byCampaign} barSize={36}>
                      <XAxis dataKey="name" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }}
                        formatter={(v: number) => [fmt(v), "게시물당 평균 반응"]} />
                      <Bar dataKey="avgReactions" name="평균 반응" radius={[8,8,0,0]}>
                        {byCampaign.map((e, i) => <Cell key={i} fill={getCampaignColor(e.fullName)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* 캠페인 요약 테이블 */}
                <table className="w-full text-xs mt-4">
                  <thead>
                    <tr className="border-b border-[#dcdfeb]">
                      {["캠페인", "투고 기간", "게시물", "총 좋아요", "총 댓글", "게시물당 반응", "총 재생"].map(h => (
                        <th key={h} className={`py-2 text-[10px] font-bold text-[#8a8ba0] uppercase tracking-wider ${h === "캠페인" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byCampaign.map(row => (
                      <tr key={row.name} className="border-b border-[#eef0f5] hover:bg-[#00000005]">
                        <td className="py-2.5 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getCampaignColor(row.fullName) }} />
                          <span className="text-[#2c2d3d] truncate max-w-[120px]">{row.name}</span>
                        </td>
                        <td className="py-2.5 text-right text-[#6b6c80] whitespace-nowrap">
                          {row.minDate.slice(2).replace(/-/g, ".")} ~ {row.maxDate.slice(2).replace(/-/g, ".")}
                        </td>
                        <td className="py-2.5 text-right text-[#6b6c80]">{row.count}</td>
                        <td className="py-2.5 text-right text-[#6b6c80]">{fmt(row.likes)}</td>
                        <td className="py-2.5 text-right text-[#6b6c80]">{fmt(row.comments)}</td>
                        <td className="py-2.5 text-right font-bold" style={{ color: getCampaignColor(row.fullName) }}>{fmt(row.avgReactions)}</td>
                        <td className="py-2.5 text-right text-[#6b6c80]">{row.plays > 0 ? fmt(row.plays) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* ③ 콘텐츠 유형별 평균 반응 */}
              <Card>
                <SectionTitle>콘텐츠 유형 — 평균 반응 vs 게시물 수</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={byType} barSize={32}>
                    <XAxis dataKey="type" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                    <YAxis yAxisId="right" orientation="right" stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#6b6c80" }} />
                    <Bar yAxisId="left" dataKey="avgReactions" name="평균 반응" radius={[6,6,0,0]}>
                      {byType.map((e, i) => <Cell key={i} fill={TYPE_COLORS[e.type] ?? "#6366f1"} />)}
                    </Bar>
                    <Bar yAxisId="right" dataKey="count" name="게시물 수" fill="#c5c8d6" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* ④ 해시태그 수 vs 평균 반응 */}
              <Card>
                <SectionTitle>해시태그 개수 — 반응에 영향을 미칠까?</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hashtagImpact} barSize={40}>
                    <XAxis dataKey="bucket" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }}
                      formatter={(v: number, name: string) => [name === "avg" ? fmt(v) : v, name === "avg" ? "평균 반응" : "게시물 수"]} />
                    <Bar dataKey="avg" name="avg" fill="#f59e0b" radius={[8,8,0,0]}
                      label={{ position: "top", fill: "#6b6c80", fontSize: 10, formatter: (v: number) => fmt(v) }} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-[#8a8ba0] mt-2 text-center">각 구간 게시물 수: {hashtagImpact.map(h => `${h.bucket} ${h.count}건`).join(" / ")}</p>
              </Card>
            </div>

            {/* ⑤ 상위 기여 계정 */}
            <Card>
              <SectionTitle>반응 TOP 8 계정</SectionTitle>
              <div className="space-y-2">
                {topAccounts.map((acc, i) => {
                  const maxReactions = topAccounts[0]?.reactions ?? 1
                  const barPct = Math.round(acc.reactions / maxReactions * 100)
                  const color = CHANNEL_COLORS[acc.channel] ?? "#6366f1"
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[11px] text-[#8a8ba0] w-4 text-right flex-shrink-0">{i + 1}</span>
                      <span className="text-[11px] font-semibold text-[#4b4c60] w-28 truncate flex-shrink-0">@{acc.owner}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                        style={{ background: color + "22", color }}>
                        {CHANNEL_LABELS[acc.channel] ?? acc.channel}
                      </span>
                      <div className="flex-1 h-2 bg-[#eef0f5] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: color }} />
                      </div>
                      <span className="text-[11px] text-[#6b6c80] w-14 text-right flex-shrink-0">{fmt(acc.reactions)}</span>
                      <span className="text-[10px] text-[#8a8ba0] w-10 text-right flex-shrink-0">{acc.count}건</span>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* ⑥ 인기 해시태그 */}
            <Card>
              <SectionTitle>인기 해시태그 TOP 12</SectionTitle>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byHashtag} layout="vertical" barSize={14}>
                  <XAxis type="number" stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="tag" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }} />
                  <Bar dataKey="count" name="게시물수" fill="#6366f1" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            Tab: 콜라보 비교 (브랜드별 이전 vs 이번)
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "compare" && (
          <div className="space-y-4">
            {brandStats.map(({ brand, prev, curr, change, countChange, likesChange, commentsChange, playsChange, engagementChange }) => {
              const cmp = BRAND_COMPARISONS.find(b => b.brand === brand)!
              const prevColor = "#8a8ba0"
              const currColor = getCampaignColor(cmp.currName)
              const showPlays = prev.plays > 0 || curr.plays > 0
              const countChartData = [
                { metric: "게시물수", 이전: prev.count,     이번: curr.count },
                { metric: "총 반응",  이전: prev.reactions, 이번: curr.reactions },
              ]
              return (
                <Card key={brand}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <SectionTitle>{brand.toUpperCase()} — 이전 콜라보 vs 이번 콜라보</SectionTitle>
                    {change !== null && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold"
                        style={{
                          background: change >= 0 ? "#34d39922" : "#f8717122",
                          color: change >= 0 ? "#34d399" : "#f87171",
                        }}>
                        게시물당 반응 {change >= 0 ? "+" : ""}{change}%
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    {[
                      { label: cmp.prevName, data: prev, color: prevColor },
                      { label: cmp.currName, data: curr, color: currColor },
                    ].map(({ label, data, color }) => (
                      <div key={label} className="rounded-xl border border-[#dcdfeb] p-4" style={{ background: "#f4f5f9" }}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold" style={{ color }}>{getCampaignLabel(label)}</span>
                          <span className="text-[10px] text-[#8a8ba0]">{data.minDate} ~ {data.maxDate}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] text-[#8a8ba0] mb-0.5">게시물 수</p>
                            <p className="text-lg font-bold text-[#1a1b26]">{data.count}건</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#8a8ba0] mb-0.5">게시물당 반응</p>
                            <p className="text-lg font-bold text-[#1a1b26]">{fmt(data.avgReactions)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#8a8ba0] mb-0.5">게시물당 좋아요</p>
                            <p className="text-sm font-semibold text-[#4b4c60]">{fmt(data.avgLikes)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#8a8ba0] mb-0.5">게시물당 댓글</p>
                            <p className="text-sm font-semibold text-[#4b4c60]">{data.avgComments}</p>
                          </div>
                          {showPlays && (
                            <div>
                              <p className="text-[10px] text-[#8a8ba0] mb-0.5">게시물당 재생</p>
                              <p className="text-sm font-semibold text-[#4b4c60]">{fmt(data.avgPlays)}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] text-[#8a8ba0] mb-0.5">평균 참여율</p>
                            <p className="text-sm font-semibold text-[#4b4c60]">{data.avgEngagement}%</p>
                          </div>
                          <div className="col-span-2 pt-2 mt-1 border-t border-[#dcdfeb] flex gap-4 text-[10px] text-[#8a8ba0]">
                            <span>총 좋아요 {fmt(data.likes)}</span>
                            <span>총 댓글 {fmt(data.comments)}</span>
                            {data.plays > 0 && <span>총 재생 {fmt(data.plays)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 게시물당 인게이지먼트 비교 (좋아요/댓글/재생/참여율) */}
                  <div className="mb-4">
                    <p className="text-[10px] font-bold tracking-widest text-[#8a8ba0] uppercase mb-3">게시물당 인게이지먼트 비교</p>
                    <div className={`grid grid-cols-1 sm:grid-cols-2 ${showPlays ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}>
                      <MetricCompareRow label="좋아요/건" prevVal={prev.avgLikes} currVal={curr.avgLikes}
                        prevColor={prevColor} currColor={currColor} format={n => fmt(n)} change={likesChange} />
                      <MetricCompareRow label="댓글/건" prevVal={prev.avgComments} currVal={curr.avgComments}
                        prevColor={prevColor} currColor={currColor} format={n => n.toString()} change={commentsChange} />
                      {showPlays && (
                        <MetricCompareRow label="재생/건" prevVal={prev.avgPlays} currVal={curr.avgPlays}
                          prevColor={prevColor} currColor={currColor} format={n => fmt(n)} change={playsChange} />
                      )}
                      <MetricCompareRow label="평균 참여율" prevVal={prev.avgEngagement} currVal={curr.avgEngagement}
                        prevColor={prevColor} currColor={currColor} format={n => `${n}%`} change={engagementChange} />
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={countChartData} barSize={28}>
                      <XAxis dataKey="metric" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }} formatter={(v: number) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#6b6c80" }} />
                      <Bar dataKey="이전" name="이전 콜라보" fill={prevColor} radius={[6,6,0,0]} />
                      <Bar dataKey="이번" name="이번 콜라보" fill={currColor} radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {countChange !== null && (
                    <p className="text-[11px] text-[#8a8ba0] mt-2 text-center">
                      게시물 수 {countChange >= 0 ? "+" : ""}{countChange}% · 총 반응 {prev.reactions > 0 ? `${Math.round((curr.reactions - prev.reactions) / prev.reactions * 100)}%` : "-"} 변화
                    </p>
                  )}
                </Card>
              )
            })}
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
                  <XAxis dataKey="date" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "#6366f1", strokeWidth: 1, strokeDasharray: "4 2" }} />
                  <Line type="monotone" dataKey="count" name="게시물수" stroke="#6366f1" strokeWidth={2.5}
                    dot={{ fill: "#6366f1", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#4f46e5", strokeWidth: 0 }} />
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
                  <XAxis dataKey="day" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }} />
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
              <span className="text-[11px] text-[#8a8ba0]">정렬:</span>
              {(["reactions", "plays", "comments"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    background: sortBy === s ? "#6366f122" : "transparent",
                    border: `1px solid ${sortBy === s ? "#6366f1" : "#dcdfeb"}`,
                    color: sortBy === s ? "#4f46e5" : "#8a8ba0",
                  }}>
                  {s === "reactions" ? "🔥 반응 순" : s === "plays" ? "▶ 재생 순" : "💬 댓글 순"}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-[#8a8ba0]">
                {showAllPosts ? `전체 ${sortedPosts.length}건` : `상위 20건 (전체 ${sortedPosts.length}건)`}
              </span>
              {sortedPosts.length > 20 && (
                <button onClick={() => setShowAllPosts(v => !v)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{ border: "1px solid #dcdfeb", color: "#4f46e5" }}>
                  {showAllPosts ? "상위 20건만 보기" : "전체 보기"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {topPosts.map((p, i) => (
                <a key={i} href={p.url || "#"} target="_blank" rel="noopener noreferrer"
                  className="group block rounded-2xl overflow-hidden border border-[#dcdfeb] hover:border-[#6366f1] transition-all hover:shadow-lg hover:shadow-[#6366f120]"
                  style={{ background: "#ffffff" }}>

                  {/* 썸네일 */}
                  <div className="relative aspect-square bg-[#eef0f5] overflow-hidden">
                    {p.displayUrl ? (
                      <img src={p.displayUrl} alt="" loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden") }} />
                    ) : null}
                    {/* 이미지 없을 때 캡션 미리보기 */}
                    <div className={`w-full h-full p-3 flex flex-col items-center justify-center text-center gap-2 ${p.displayUrl ? "hidden" : ""}`}>
                      <span className="text-2xl text-[#c5c8d6]">{p.isVideo ? "▶" : "🖼"}</span>
                      <p className="text-[10px] text-[#6b6c80] leading-relaxed line-clamp-5 break-words">
                        {p.caption ? p.caption.slice(0, 90) : "내용 없음"}
                      </p>
                    </div>

                    {/* 오버레이 그라디언트 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* 순위 뱃지 */}
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: i < 3 ? "#f59e0b" : "#6366f1" }}>
                      {i + 1}
                    </div>

                    {/* 채널 + 콘텐츠 유형 */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                        style={{ background: CHANNEL_COLORS[p.channel] + "dd", color: "#fff" }}>
                        {CHANNEL_LABELS[p.channel] ?? p.channel}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                        style={{ background: "#00000088", color: "#fff" }}>
                        {p.isVideo ? "▶" : p.contentType === "캐러셀" ? "⊞" : "◻"}
                      </span>
                    </div>

                    {/* 캠페인 배지 */}
                    {isCampaignPost(p.ipName) && (
                      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1">
                        <div className="flex-1 truncate px-2 py-0.5 rounded-md text-[9px] font-bold"
                          style={{ background: getCampaignColor(p.ipName) + "cc", color: "#fff" }}>
                          {getCampaignLabel(p.ipName)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="p-3">
                    <p className="text-[11px] font-semibold text-[#2c2d3d] truncate">@{p.owner}</p>
                    <p className="text-[10px] text-[#8a8ba0] line-clamp-2 mt-0.5 leading-relaxed">
                      {p.caption.slice(0, 60)}
                    </p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {p.hashtags.slice(0, 2).map((h, j) => (
                        <span key={j} className="text-[9px] text-[#6366f1] truncate max-w-[80px]">{h}</span>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#eef0f5]">
                      <span className="text-[10px] text-[#6b6c80]">
                        {p.channel === "TikTok" || p.channel === "YouTube" ? `▶ ${fmt(p.plays)}` : `💬 ${p.comments}`}
                      </span>
                      <span className="text-[10px] text-[#8a8ba0]">{p.date.slice(5)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            Tab: 댓글 반응
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "reaction" && (
          <div className="space-y-4">

            {/* 감성 분포 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {sentimentDist.map(({ s, count, pct }) => (
                <div key={s} className="bg-[#ffffff] border border-[#dcdfeb] rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: SENTIMENT_COLORS[s] }} />
                  <p className="text-[11px] font-bold tracking-widest uppercase mb-1" style={{ color: SENTIMENT_COLORS[s] }}>{s}</p>
                  <p className="text-3xl font-bold text-[#1a1b26]">{pct}%</p>
                  <p className="text-[11px] text-[#8a8ba0] mt-1">{count}건</p>
                  {/* 바 */}
                  <div className="mt-3 h-1 rounded-full bg-[#dcdfeb] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: SENTIMENT_COLORS[s] }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* 반응 키워드 */}
              <Card>
                <SectionTitle>반응 키워드 TOP 20</SectionTitle>
                {topKeywords.length === 0 ? (
                  <p className="text-[#8a8ba0] text-sm">키워드 데이터 없음</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topKeywords.map(({ kw, count }, i) => {
                      const size = Math.max(11, Math.min(22, 11 + count * 2))
                      const opacity = Math.max(0.4, Math.min(1, 0.4 + count * 0.1))
                      return (
                        <span key={i} className="px-3 py-1.5 rounded-full font-bold cursor-default"
                          style={{
                            fontSize: size,
                            background: "#6366f1" + Math.round(opacity * 40).toString(16).padStart(2,"0"),
                            color: `rgba(129,140,248,${opacity})`,
                            border: "1px solid #6366f133",
                          }}>
                          {kw} <span className="text-[10px] opacity-60">{count}</span>
                        </span>
                      )
                    })}
                  </div>
                )}
              </Card>

              {/* 감성별 게시물 수 차트 */}
              <Card>
                <SectionTitle>감성 분포 (게시물 수)</SectionTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={sentimentDist} barSize={48}>
                    <XAxis dataKey="s" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }} />
                    <Bar dataKey="count" name="게시물수" radius={[8,8,0,0]}>
                      {sentimentDist.map((e, i) => <Cell key={i} fill={SENTIMENT_COLORS[e.s]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* 이전 vs 이번 콜라보 댓글 감성 비교 */}
            {sentimentCompare.map(cmp => (
              <Card key={cmp.brand}>
                <SectionTitle>{cmp.brand.toUpperCase()} — 댓글 감성 비교 (이전 vs 이번)</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2 text-[11px]">
                      <span className="flex items-center gap-1 font-bold" style={{ color: "#9ca3af" }}>
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#6b7280" }} />
                        {getCampaignLabel(cmp.prevName)} ({cmp.prevTotal}건)
                      </span>
                      <span className="flex items-center gap-1 font-bold" style={{ color: getCampaignColor(cmp.currName) }}>
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: getCampaignColor(cmp.currName) }} />
                        {getCampaignLabel(cmp.currName)} ({cmp.currTotal}건)
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={cmp.chartData} barSize={28}>
                        <XAxis dataKey="s" stroke="#c5c8d6" tick={{ fill: "#6b6c80", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis stroke="#c5c8d6" tick={{ fill: "#8a8ba0", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#00000008" }} formatter={(v: number) => `${v}%`} />
                        <Bar dataKey="이전" name={getCampaignLabel(cmp.prevName)} fill="#6b7280" radius={[6,6,0,0]} />
                        <Bar dataKey="이번" name={getCampaignLabel(cmp.currName)} fill={getCampaignColor(cmp.currName)} radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 반응 키워드 비교 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-bold text-[#9ca3af] mb-2">{getCampaignLabel(cmp.prevName)} 키워드</p>
                      {cmp.prevKeywords.length === 0 ? (
                        <p className="text-[#8a8ba0] text-xs">키워드 없음</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {cmp.prevKeywords.map(({ kw, count }, j) => (
                            <span key={j} className="text-[10px] px-2 py-1 rounded-full font-semibold"
                              style={{ background: "#6b728022", color: "#9ca3af", border: "1px solid #6b728033" }}>
                              {kw} <span className="opacity-60">{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold mb-2" style={{ color: getCampaignColor(cmp.currName) }}>{getCampaignLabel(cmp.currName)} 키워드</p>
                      {cmp.currKeywords.length === 0 ? (
                        <p className="text-[#8a8ba0] text-xs">키워드 없음</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {cmp.currKeywords.map(({ kw, count }, j) => (
                            <span key={j} className="text-[10px] px-2 py-1 rounded-full font-semibold"
                              style={{ background: getCampaignColor(cmp.currName) + "22", color: getCampaignColor(cmp.currName), border: `1px solid ${getCampaignColor(cmp.currName)}33` }}>
                              {kw} <span className="opacity-60">{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 실제 댓글 비교 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[#dcdfeb]">
                  {[
                    { label: cmp.prevName, comments: cmp.prevTopComments, color: "#9ca3af" },
                    { label: cmp.currName, comments: cmp.currTopComments, color: getCampaignColor(cmp.currName) },
                  ].map(({ label, comments, color }) => (
                    <div key={label}>
                      <p className="text-[10px] font-bold mb-2" style={{ color }}>{getCampaignLabel(label)} 인기 댓글</p>
                      {comments.length === 0 ? (
                        <p className="text-[#8a8ba0] text-xs">댓글 데이터 없음</p>
                      ) : (
                        <div className="space-y-2">
                          {comments.map((p, j) => (
                            <a key={j} href={p.url || "#"} target="_blank" rel="noopener noreferrer"
                              className="block p-2.5 rounded-lg border border-[#dcdfeb] hover:border-[#6366f1] transition-colors bg-[#f4f5f9]">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                  style={{ background: SENTIMENT_COLORS[p.sentiment] + "22", color: SENTIMENT_COLORS[p.sentiment] }}>
                                  {p.sentiment}
                                </span>
                                <span className="text-[10px] text-[#8a8ba0] ml-auto">❤️ {fmt(p.likes)}</span>
                              </div>
                              <p className="text-xs text-[#2c2d3d] leading-relaxed line-clamp-2">
                                💬 {p.translatedComment || p.firstComment}
                              </p>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            {/* 댓글 미리보기 카드 */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <SectionTitle>실제 댓글 반응 미리보기 ({postsWithComments.length}건)</SectionTitle>
                <span className="text-[10px] text-[#8a8ba0] bg-[#eef0f5] px-2 py-1 rounded-lg">📸 Instagram 전체 기준</span>
              </div>
              {postsWithComments.length === 0 ? (
                <p className="text-[#8a8ba0] text-sm">댓글 데이터가 없습니다.<br/>Instagram Apify 액터에서 <code className="text-[#6366f1]">firstComment</code> 필드가 수집되고 있는지 확인하세요.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {postsWithComments.map((p, i) => (
                    <a key={i} href={p.url || "#"} target="_blank" rel="noopener noreferrer"
                      className="flex gap-3 p-3 rounded-xl border border-[#dcdfeb] hover:border-[#6366f1] transition-colors bg-[#f4f5f9]">
                      {/* 썸네일 */}
                      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-[#eef0f5]">
                        {p.displayUrl ? (
                          <img src={p.displayUrl} alt="" className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl text-[#c5c8d6]">🖼</div>
                        )}
                      </div>
                      {/* 텍스트 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-semibold text-[#4b4c60]">@{p.owner}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{ background: SENTIMENT_COLORS[p.sentiment] + "22", color: SENTIMENT_COLORS[p.sentiment] }}>
                            {p.sentiment}
                          </span>
                          <span className="text-[10px] text-[#8a8ba0] ml-auto">{p.date.slice(5)}</span>
                        </div>
                        {/* 첫 댓글 (한국어 번역) */}
                        <p className="text-xs text-[#2c2d3d] leading-relaxed line-clamp-2">
                          💬 {p.translatedComment || p.firstComment}
                        </p>
                        {/* 감성 키워드 */}
                        {p.sentimentKeywords.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {p.sentimentKeywords.slice(0, 4).map((kw, j) => (
                              <span key={j} className="text-[9px] px-1.5 py-0.5 rounded"
                                style={{ background: SENTIMENT_COLORS[p.sentiment] + "22", color: SENTIMENT_COLORS[p.sentiment] }}>
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* 좋아요 */}
                        <p className="text-[10px] text-[#8a8ba0] mt-1">❤️ {p.likes.toLocaleString()}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            Tab: 데이터
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "raw" && (
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#dcdfeb] flex items-center justify-between">
              <SectionTitle>원본 데이터 ({fp.length}건)</SectionTitle>
            </div>
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ background: "#ffffff" }}>
                  <tr className="border-b border-[#dcdfeb]">
                    {["날짜", "채널", "캠페인", "계정", "유형", "재생", "좋아요", "댓글", "링크"].map(h => (
                      <th key={h} className={`px-4 py-3 text-[10px] font-bold tracking-widest text-[#8a8ba0] uppercase whitespace-nowrap ${h === "댓글" || h === "링크" ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fp.slice(0, 300).map((p, i) => (
                    <tr key={i} className="border-b border-[#eef0f5] hover:bg-[#00000005] transition-colors">
                      <td className="px-4 py-2.5 text-[#6b6c80] whitespace-nowrap">{p.date}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: CHANNEL_COLORS[p.channel] + "22", color: CHANNEL_COLORS[p.channel] }}>
                          {p.channel === "TikTok" ? "🎵 TikTok" : p.channel === "YouTube" ? "▶️ YouTube" : "📸 IG"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: getCampaignColor(p.ipName) + "22", color: getCampaignColor(p.ipName) }}>
                          {getCampaignLabel(p.ipName)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#4b4c60] font-medium">@{p.owner}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: (TYPE_COLORS[p.contentType] ?? "#6b7280") + "22", color: TYPE_COLORS[p.contentType] ?? "#6b6c80" }}>
                          {p.contentType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-[#6b6c80]">{p.plays > 0 ? fmt(p.plays) : "-"}</td>
                      <td className="px-4 py-2.5 text-center text-[#6b6c80]">{p.likes > 0 ? fmt(p.likes) : "-"}</td>
                      <td className="px-4 py-2.5 text-center text-[#6b6c80]">{p.comments > 0 ? p.comments : "-"}</td>
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
