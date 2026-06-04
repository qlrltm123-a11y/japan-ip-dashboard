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
  url: string
  displayUrl: string
  isVideo: boolean
}

// ── 캠페인 감지 규칙 ──────────────────────────────────────────────────────────
export const CAMPAIGN_RULES: { name: string; keywords: string[] }[] = [
  {
    name: "ウェイクメイク_平成ギャルエディション",
    keywords: ["ウェイクメイク", "웨이크메이크", "平成ギャル", "헤이세이갸루", "wakemake"],
  },
  {
    name: "カラーグラム_ギャルしんちゃんコレクション",
    keywords: ["カラーグラム", "컬러그램", "ギャルしんちゃん", "갸루신짱", "colorgram", "しんちゃん"],
  },
  // ↓ 새 캠페인 추가 시 여기에만 추가
  // { name: "캠페인명", keywords: ["키워드1", "키워드2"] },
]

function detectIP(caption: string, hashtags: string[]): string {
  const text = (caption + " " + hashtags.join(" ")).toLowerCase()
  for (const rule of CAMPAIGN_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase())) return rule.name
    }
  }
  const commonKws = ["コラボ", "collab", "collaboration", "콜라보"]
  for (const kw of commonKws) {
    if (text.includes(kw.toLowerCase())) return "기타_콜라보"
  }
  return "미분류"
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
    const impressions = comments > 0 ? comments * 50 : 100
    const reactions = comments
    return {
      channel: "Instagram" as const,
      date: (row["timestamp"] ?? "").split("T")[0],
      owner: row["ownerUsername"] ?? "",
      ownerFullName: row["ownerFullName"] ?? "",
      caption,
      hashtags,
      comments,
      likes: 0,
      plays: 0,
      shares: 0,
      reactions,
      impressions,
      engagementRate: impressions > 0 ? +((reactions / impressions) * 100).toFixed(2) : 0,
      contentType: row["type"]?.toLowerCase() === "video" ? "영상" : row["type"]?.toLowerCase() === "sidecar" ? "캐러셀" : "이미지",
      ipName: detectIP(caption, hashtags),
      url: row["url"] ?? "",
      displayUrl: row["displayUrl"] ?? row["images/0"] ?? "",
      isVideo: row["type"]?.toLowerCase() === "video",
    }
  }).filter(p => p.date)
}

function parseTikTok(rows: Record<string, string>[]): Post[] {
  return rows.map((row) => {
    // TikTok 액터 컬럼: text/desc, authorMeta/name, createTime, stats/playCount, stats/diggCount, stats/commentCount, stats/shareCount, webVideoUrl, covers/default
    const caption = row["text"] ?? row["desc"] ?? row["description"] ?? ""
    const plays   = toNum(row["playCount"] ?? row["stats/playCount"] ?? row["videoMeta/playCount"])
    const likes   = toNum(row["diggCount"] ?? row["stats/diggCount"] ?? row["likesCount"])
    const comments= toNum(row["commentCount"] ?? row["stats/commentCount"] ?? row["commentsCount"])
    const shares  = toNum(row["shareCount"] ?? row["stats/shareCount"])
    const reactions = likes + comments + shares
    const impressions = plays > 0 ? plays : reactions * 20

    // 해시태그: caption에서 추출
    const hashtags = (caption.match(/#[\w　-鿿가-힣]+/g) ?? []).slice(0, 8)

    const dateRaw = row["createTime"] ?? row["createTimeISO"] ?? row["createdAt"] ?? ""
    const date = dateRaw.length >= 10 ? dateRaw.slice(0, 10) : new Date(toNum(dateRaw) * 1000).toISOString().slice(0, 10)

    return {
      channel: "TikTok" as const,
      date,
      owner: row["authorMeta/name"] ?? row["author/uniqueId"] ?? row["authorId"] ?? "",
      ownerFullName: row["authorMeta/nickName"] ?? row["author/nickname"] ?? "",
      caption,
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
      url: row["webVideoUrl"] ?? row["url"] ?? "",
      displayUrl: row["covers/default"] ?? row["thumbnailUrl"] ?? row["coverUrl"] ?? "",
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
