import Papa from "papaparse"

const INSTAGRAM_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5ohtCnyOZNc8d02TchDIIYxix8UUB5rPiylPAxiiBaPBOZalqdCWGNRqWx4JTXoy-byBQFoU795un/pub?output=csv"

const TIKTOK_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTzrniY-zmDRG9TRkZCmW-q6rGpvvORhGuq78-PsYmZh_BArUoY89b3ZutSy2srQ8PRz83NSirpBYNz/pub?output=csv"

export type MatchLevel = "확정" | "추정" | "미분류"

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
  matchLevel: MatchLevel   // 확정: 모든 조건 충족 / 추정: 일부 충족 / 미분류
  sentiment: "긍정" | "부정" | "구매의도" | "중립"
  sentimentKeywords: string[]
  url: string
  displayUrl: string
  isVideo: boolean
  isJapanese: boolean
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
// mustMatch: 그룹마다 하나씩 반드시 매칭 (AND 조건)
// 예) mustMatch = [[브랜드명들], [제품명들]] → 브랜드명 중 하나 AND 제품명 중 하나 동시 포함 시 분류
export const CAMPAIGN_RULES: {
  name: string
  mustMatch: string[][]
  // 각 배열에서 최소 1개씩 모두 매칭돼야 함 (AND)
  // 그룹1: 한국 브랜드명, 그룹2: 일본 브랜드명, 그룹3: 콜라보/제품 키워드
}[] = [
  {
    name: "ウェイクメイク_平成ギャルエディション",
    mustMatch: [
      ["wakemake", "웨이크메이크"],                                    // ① 한국 브랜드명
      ["ウェイクメイク"],                                               // ② 일본 브랜드명
      ["平成ギャル", "ギャルエディション", "헤이세이갸루", "ギャルメイク"], // ③ 제품/콜라보 키워드
    ],
  },
  {
    name: "カラーグラム_ギャルしんちゃんコレクション",
    mustMatch: [
      ["colorgram", "컬러그램"],                                              // ① 한국 브랜드명
      ["カラーグラム"],                                                        // ② 일본 브랜드명
      ["ギャルしんちゃん", "しんちゃんコレクション", "クレヨンしんちゃん", "갸루신짱"], // ③ 제품/콜라보 키워드
    ],
  },
  {
    name: "カラーグラム_立体創造シェーディングスティック",
    mustMatch: [
      ["colorgram", "カラーグラム", "컬러그램"],                                             // ① 브랜드 (한/일 중 하나)
      ["シェーディング", "シェーディングスティック", "ノーズシャドウ", "ノーズシェーディング", "立体創造"], // ② 제품 키워드
    ],
  },
  // ↓ 새 캠페인 추가 예시
  // {
  //   name: "브랜드_캠페인명",
  //   mustMatch: [
  //     ["한국브랜드명"],      // ① 한국 브랜드
  //     ["日本ブランド名"],    // ② 일본 브랜드
  //     ["콜라보키워드"],      // ③ 제품/콜라보
  //   ],
  // },
]

function detectIP(caption: string, hashtags: string[]): { ipName: string; matchLevel: MatchLevel } {
  const text = (caption + " " + hashtags.join(" ")).toLowerCase()

  let bestMatch = { ipName: "미분류", matchLevel: "미분류" as MatchLevel, hitGroups: 0 }

  for (const rule of CAMPAIGN_RULES) {
    const hitGroups = rule.mustMatch.filter(group =>
      group.some(kw => text.includes(kw.toLowerCase()))
    ).length
    const totalGroups = rule.mustMatch.length

    if (hitGroups === totalGroups) {
      // 모든 그룹 충족 → 확정
      return { ipName: rule.name, matchLevel: "확정" }
    }
    if (hitGroups >= 1 && hitGroups > bestMatch.hitGroups) {
      // 일부 그룹 충족 → 추정 후보
      bestMatch = { ipName: rule.name, matchLevel: "추정", hitGroups }
    }
  }

  if (bestMatch.matchLevel === "추정") {
    return { ipName: bestMatch.ipName, matchLevel: "추정" }
  }
  return { ipName: "미분류", matchLevel: "미분류" }
}

export function isCampaignPost(ipName: string): boolean {
  return CAMPAIGN_RULES.some(r => r.name === ipName)
}

// 일본어 문자 포함 여부 (히라가나·카타카나·한자)
function hasJapanese(text: string): boolean {
  return /[぀-ゟ゠-ヿ一-龯]/.test(text)
}

// URL 기준 중복 제거
function dedup(posts: Post[]): Post[] {
  const seen = new Set<string>()
  return posts.filter(p => {
    const key = p.url || `${p.owner}::${p.date}::${p.caption.slice(0, 30)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
    const { ipName, matchLevel } = detectIP(caption, hashtags)
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
      ipName,
      matchLevel,
      sentiment,
      sentimentKeywords,
      url: row["url"] ?? "",
      displayUrl: proxyImg(row["displayUrl"] ?? row["images/0"] ?? ""),
      isVideo: row["type"]?.toLowerCase() === "video",
      isJapanese: hasJapanese(caption + hashtags.join(" ")),
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
    const { ipName, matchLevel } = detectIP(caption, hashtags)
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
      ipName,
      matchLevel,
      sentiment,
      sentimentKeywords,
      url: row["webVideoUrl"] ?? row["url"] ?? "",
      displayUrl: proxyImg(
        row["covers/dynamic"] ?? row["covers/default"] ?? row["videoMeta/coverUrl"] ??
        row["thumbnailUrl"] ?? row["coverUrl"] ?? row["authorMeta/avatar"] ?? ""
      ),
      isVideo: true,
      isJapanese: hasJapanese(caption + hashtags.join(" ")),
    }
  }).filter(p => p.date)
}

export async function fetchPosts(): Promise<{ posts: Post[]; allPosts: Post[] }> {
  const [igRows, ttRows] = await Promise.all([
    fetchCSV(INSTAGRAM_CSV_URL),
    fetchCSV(TIKTOK_CSV_URL),
  ])

  const igPosts = parseInstagram(igRows)
  const ttPosts = parseTikTok(ttRows)

  const allRaw   = [...igPosts, ...ttPosts].sort((a, b) => b.date.localeCompare(a.date))
  const allPosts = dedup(allRaw)                                                          // 중복 제거
  const jpPosts  = allPosts.filter(p => p.isJapanese)                                    // 일본어만
  const posts    = jpPosts.filter(p => p.matchLevel === "확정" || p.matchLevel === "추정") // 확정+추정만

  return { posts, allPosts: jpPosts }
}
