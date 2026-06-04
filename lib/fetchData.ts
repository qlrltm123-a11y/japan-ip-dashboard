import Papa from "papaparse"

const INSTAGRAM_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5ohtCnyOZNc8d02TchDIIYxix8UUB5rPiylPAxiiBaPBOZalqdCWGNRqWx4JTXoy-byBQFoU795un/pub?output=csv"

const TIKTOK_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTzrniY-zmDRG9TRkZCmW-q6rGpvvORhGuq78-PsYmZh_BArUoY89b3ZutSy2srQ8PRz83NSirpBYNz/pub?output=csv"

export interface Post {
  channel: "Instagram" | "TikTok"
  date: string
  owner: string
  ownerFullName: string
  caption: string
  firstComment: string
  hashtags: string[]
  comments: number
  likes: number
  plays: number
  shares: number
  reactions: number
  impressions: number
  engagementRate: number
  contentType: string
  ipName: string
  sentiment: "긍정" | "부정" | "구매의도" | "중립"
  sentimentKeywords: string[]
  url: string
  displayUrl: string
  isVideo: boolean
}

// ── 감성 분석 키워드 ──────────────────────────────────────────────────────────
const SENTIMENT_RULES: { label: "긍정" | "부정" | "구매의도"; keywords: string[] }[] = [
  {
    label: "구매의도",
    keywords: ["買いたい", "欲しい", "買った", "注文", "ポチ", "購入", "get", "買う", "살거", "샀어", "구매"],
  },
  {
    label: "긍정",
    keywords: [
      "かわいい", "可愛い", "好き", "最高", "素敵", "すごい", "テンション", "ギラギラ",
      "似合う", "欲しい", "綺麗", "おしゃれ", "映え", "やばい", "好きすぎ", "推し",
      "✨", "🩷", "💕", "❤️", "💖", "🎀",
    ],
  },
  {
    label: "부정",
    keywords: ["高い", "微妙", "いまいち", "残念", "失敗", "ひどい", "最悪", "😢", "😞"],
  },
]

export function analyzeSentiment(text: string): { sentiment: Post["sentiment"]; keywords: string[] } {
  const found: { label: Post["sentiment"]; kw: string }[] = []
  for (const rule of SENTIMENT_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) found.push({ label: rule.label, kw })
    }
  }
  const keywords = found.map(f => f.kw)
  if (found.some(f => f.label === "구매의도")) return { sentiment: "구매의도", keywords }
  if (found.some(f => f.label === "긍정")) return { sentiment: "긍정", keywords }
  if (found.some(f => f.label === "부정")) return { sentiment: "부정", keywords }
  return { sentiment: "중립", keywords }
}

// ── 캠페인 감지 규칙 ──────────────────────────────────────────────────────────
// ── 캠페인 감지 규칙 ──────────────────────────────────────────────────────────
// required: 하나 이상 반드시 포함 / optional: 하나라도 있으면 추가 점수 (미래 확장용)
export const CAMPAIGN_RULES: { name: string; required: string[]; boost?: string[] }[] = [
  {
    name: "ウェイクメイク_平成ギャルエディション",
    // 반드시 브랜드명이 있어야 함 — 平成ギャル 단독은 오탐이므로 제외
    required: ["ウェイクメイク", "웨이크메이크", "wakemake", "ウェイクメイクギャル"],
    boost: ["平成ギャル", "ギャルエディション"],
  },
  {
    name: "カラーグラム_ギャルしんちゃんコレクション",
    // しんちゃん 단독은 오탐 가능 → カラーグラム 계열 브랜드명 필수
    required: ["カラーグラム", "컬러그램", "colorgram"],
    boost: ["ギャルしんちゃん", "しんちゃん", "갸루신짱"],
  },
  // ↓ 새 캠페인 추가 예시
  // { name: "캠페인명", required: ["브랜드명"], boost: ["부가키워드"] },
]

function detectIP(caption: string, hashtags: string[]): string {
  const text = (caption + " " + hashtags.join(" ")).toLowerCase()
  for (const rule of CAMPAIGN_RULES) {
    // required 중 하나라도 있으면 해당 캠페인으로 분류
    const hit = rule.required.some(kw => text.includes(kw.toLowerCase()))
    if (hit) return rule.name
  }
  const commonKws = ["コラボ", "collab", "collaboration", "콜라보"]
  for (const kw of commonKws) {
    if (text.includes(kw.toLowerCase())) return "기타_콜라보"
  }
  return "미분류"
}

function proxyImg(url: string): string {
  if (!url) return ""
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=400&output=jpg`
}

function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""))
  return isNaN(n) ? 0 : n
}

async function fetchCSV(url: string): Promise<Record<string, string>[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } })
    const text = await res.text()
    const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    return data
  } catch {
    return []
  }
}

function parseInstagram(rows: Record<string, string>[]): Post[] {
  return rows.map((row) => {
    const caption = row["caption"] ?? ""
    const comments = toNum(row["commentsCount"])
    const hashtags: string[] = []
    for (let i = 0; i < 10; i++) {
      const h = row[`hashtags/${i}`]
      if (h?.trim()) hashtags.push(h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`)
      else break
    }
    const likes = toNum(row["likesCount"])
    const firstComment = row["firstComment"] ?? ""
    const impressions = likes > 0 ? likes * 20 : comments > 0 ? comments * 50 : 100
    const reactions = likes + comments
    const sentimentText = caption + " " + firstComment
    const { sentiment, keywords: sentimentKeywords } = analyzeSentiment(sentimentText)
    return {
      channel: "Instagram" as const,
      date: (row["timestamp"] ?? "").split("T")[0],
      owner: row["ownerUsername"] ?? "",
      ownerFullName: row["ownerFullName"] ?? "",
      caption,
      firstComment,
      hashtags,
      comments,
      likes,
      plays: 0,
      shares: 0,
      reactions,
      impressions,
      engagementRate: impressions > 0 ? +((reactions / impressions) * 100).toFixed(2) : 0,
      contentType: row["type"]?.toLowerCase() === "video" ? "영상" : row["type"]?.toLowerCase() === "sidecar" ? "캐러셀" : "이미지",
      ipName: detectIP(caption, hashtags),
      sentiment,
      sentimentKeywords,
      url: row["url"] ?? "",
      displayUrl: proxyImg(row["displayUrl"] ?? row["images/0"] ?? ""),
      isVideo: row["type"]?.toLowerCase() === "video",
    }
  }).filter(p => p.date)
}

function parseTikTok(rows: Record<string, string>[]): Post[] {
  return rows.map((row) => {
    const caption   = row["text"] ?? row["desc"] ?? row["description"] ?? ""
    const plays     = toNum(row["playCount"] ?? row["stats/playCount"] ?? row["videoMeta/playCount"])
    const likes     = toNum(row["diggCount"] ?? row["stats/diggCount"] ?? row["likesCount"])
    const comments  = toNum(row["commentCount"] ?? row["stats/commentCount"] ?? row["commentsCount"])
    const shares    = toNum(row["shareCount"] ?? row["stats/shareCount"])
    const reactions = likes + comments + shares
    const impressions = plays > 0 ? plays : reactions * 20
    const hashtags  = (caption.match(/#[\w　-鿿가-힣]+/g) ?? []).slice(0, 8)
    const dateRaw   = row["createTime"] ?? row["createTimeISO"] ?? row["createdAt"] ?? ""
    const date      = dateRaw.length >= 10 ? dateRaw.slice(0, 10) : new Date(toNum(dateRaw) * 1000).toISOString().slice(0, 10)
    const { sentiment, keywords: sentimentKeywords } = analyzeSentiment(caption)
    return {
      channel: "TikTok" as const,
      date,
      owner: row["authorMeta/name"] ?? row["author/uniqueId"] ?? row["authorId"] ?? "",
      ownerFullName: row["authorMeta/nickName"] ?? row["author/nickname"] ?? "",
      caption,
      firstComment: "",
      hashtags,
      comments,
      likes,
      plays,
      shares,
      reactions,
      impressions,
      engagementRate: impressions > 0 ? +((reactions / impressions) * 100).toFixed(2) : 0,
      contentType: "영상",
      ipName: detectIP(caption, hashtags),
      sentiment,
      sentimentKeywords,
      url: row["webVideoUrl"] ?? row["url"] ?? "",
      displayUrl: proxyImg(
        row["covers/dynamic"] ?? row["covers/default"] ?? row["videoMeta/coverUrl"] ??
        row["thumbnailUrl"] ?? row["coverUrl"] ?? row["authorMeta/avatar"] ?? ""
      ),
      isVideo: true,
    }
  }).filter(p => p.date)
}

export async function fetchPosts(): Promise<Post[]> {
  const [igRows, ttRows] = await Promise.all([
    fetchCSV(INSTAGRAM_CSV_URL),
    fetchCSV(TIKTOK_CSV_URL),
  ])

  const igPosts = parseInstagram(igRows)
  const ttPosts = parseTikTok(ttRows)

  return [...igPosts, ...ttPosts].sort((a, b) => b.date.localeCompare(a.date))
}
