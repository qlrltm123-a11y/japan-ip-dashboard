import Papa from "papaparse"

const INSTAGRAM_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1KZYTTZlg0jmqzijMl9M5C39R4_4MVMEvTAdrXgttgMk/export?format=csv&gid=0"

const TIKTOK_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1i9ivD_ijIRATvS9IoUyRYK1wCvy1_10BE60ywK4CwGo/export?format=csv&gid=0"

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
// mustMatch: 그룹마다 하나씩 반드시 매칭 (AND 조건)
// 그룹1: 브랜드명(한/일), 그룹2: 콜라보 해시태그/키워드
export const CAMPAIGN_RULES: {
  name: string
  mustMatch: string[][]
}[] = [
  {
    name: "wakemake_ハローキティブラックエディション",
    // 이전 콜라보
    mustMatch: [
      ["wakemake", "웨이크메이크", "ウェイクメイク"],
      ["ハローキティブラックエディション", "ハローキティ", "헬로키티"],
    ],
  },
  {
    name: "wakemake_平成ギャルエディション",
    // 이번 콜라보
    mustMatch: [
      ["wakemake", "웨이크메이크", "ウェイクメイク"],
      ["平成ギャルエディション", "平成ギャル", "헤이세이갸루"],
    ],
  },
  {
    name: "colorgram_ギャルしんちゃんコラボ",
    mustMatch: [
      ["colorgram", "컬러그램", "カラーグラム"],
      ["ギャルしんちゃんコラボ", "ギャルしんちゃんコレクション", "ギャルしんちゃん", "갸루신짱"],
    ],
  },
  {
    name: "colorgram_クレヨンしんちゃんコラボ",
    mustMatch: [
      ["colorgram", "컬러그램", "カラーグラム"],
      ["クレヨンしんちゃんコラボ", "クレヨンリップ", "クレヨンしんちゃん"],
    ],
  },
]

// 화면 표시용 한글 라벨 (매칭 로직은 위 일본어 캠페인명 기준 그대로 사용)
export const CAMPAIGN_LABELS: Record<string, string> = {
  "wakemake_ハローキティブラックエディション": "헬로키티(이전)",
  "wakemake_平成ギャルエディション": "헤이세이갸루(이번)",
  "colorgram_ギャルしんちゃんコラボ": "갸루신짱(이번)",
  "colorgram_クレヨンしんちゃんコラボ": "크레용신짱(이전)",
  "기타_콜라보": "기타 콜라보",
  "미분류": "미분류",
}

export function getCampaignLabel(name: string): string {
  return CAMPAIGN_LABELS[name] ?? (name.split("_").pop() ?? name)
}

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

// 인스타그램 게시물 URL에서 대표 이미지 URL 추출 (/p/{shortcode}/media/?size=l)
function instagramMediaUrl(postUrl: string): string {
  const m = postUrl.match(/instagram\.com\/(?:p|reel)\/([^/?]+)/)
  if (!m) return ""
  return `https://www.instagram.com/p/${m[1]}/media/?size=l`
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

// TikTok oEmbed API로 실제 영상 썸네일 조회 (1시간 캐시)
async function fetchTikTokThumbnail(url: string): Promise<string> {
  if (!url) return ""
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { next: { revalidate: 3600 } })
    if (!res.ok) return ""
    const data = await res.json()
    return data.thumbnail_url ?? ""
  } catch {
    return ""
  }
}

// 동시 실행 개수를 제한하며 비동기 매핑
async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const cur = idx++
      await fn(items[cur])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
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
      displayUrl: proxyImg(row["displayUrl"] ?? row["images/0"] ?? instagramMediaUrl(row["url"] ?? "")),
      isVideo: row["type"]?.toLowerCase() === "video",
      isJapanese: hasJapanese(caption + hashtags.join(" ")),
    }
  }).filter(p => p.date)
}

function parseTikTok(rows: Record<string, string>[]): Post[] {
  return rows.map((row) => {
    const caption   = row["text"] ?? row["desc"] ?? row["description"] ?? ""
    const plays     = toNum(row["playCount"] ?? row["stats/playCount"] ?? row["videoMeta/playCount"] ?? row["videoMeta.playCount"])
    const likes     = toNum(row["diggCount"] ?? row["stats/diggCount"] ?? row["likesCount"] ?? row["stats.diggCount"])
    const comments  = toNum(row["commentCount"] ?? row["stats/commentCount"] ?? row["commentsCount"] ?? row["stats.commentCount"])
    const shares    = toNum(row["shareCount"] ?? row["stats/shareCount"] ?? row["stats.shareCount"])
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
      owner: row["authorMeta/name"] ?? row["authorMeta.name"] ?? row["author/uniqueId"] ?? row["authorId"] ?? "",
      ownerFullName: row["authorMeta/nickName"] ?? row["authorMeta.nickName"] ?? row["authorMeta.name"] ?? row["author/nickname"] ?? "",
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
        row["covers/dynamic"] ?? row["covers/default"] ?? row["videoMeta/coverUrl"] ?? row["videoMeta.coverUrl"] ??
        row["thumbnailUrl"] ?? row["coverUrl"] ?? row["authorMeta/avatar"] ?? row["authorMeta.avatar"] ?? ""
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
  const posts    = jpPosts.filter(p => p.matchLevel === "확정") // 확정(브랜드+콜라보 키워드 모두 매칭)만

  // 확정 매칭된 TikTok 게시물은 oEmbed로 실제 영상 썸네일 조회
  const ttConfirmed = posts.filter(p => p.channel === "TikTok")
  await mapWithConcurrency(ttConfirmed, 8, async (p) => {
    const thumb = await fetchTikTokThumbnail(p.url)
    if (thumb) p.displayUrl = proxyImg(thumb)
  })

  return { posts, allPosts: jpPosts }
}
