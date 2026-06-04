import Papa from "papaparse"

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5ohtCnyOZNc8d02TchDIIYxix8UUB5rPiylPAxiiBaPBOZalqdCWGNRqWx4JTXoy-byBQFoU795un/pub?output=csv"

export interface Post {
  date: string
  owner: string
  ownerFullName: string
  caption: string
  hashtags: string[]
  comments: number
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
// 새 캠페인 추가 시 여기에만 키워드 배열 추가하면 자동 분류됩니다
export const CAMPAIGN_RULES: { name: string; keywords: string[] }[] = [
  {
    name: "ウェイクメイク_平成ギャルエディション",
    keywords: ["ウェイクメイク", "웨이크메이크", "平成ギャル", "헤이세이갸루", "wakemake"],
  },
  {
    name: "カラーグラム_ギャルしんちゃんコレクション",
    keywords: ["カラーグラム", "컬러그램", "ギャルしんちゃん", "갸루신짱", "colorgram", "しんちゃん"],
  },
  // ↓ 새 캠페인 추가 시 여기에 추가
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

function contentTypeLabel(type: string): string {
  const t = (type ?? "").toLowerCase()
  if (t === "video") return "영상"
  if (t === "sidecar") return "캐러셀"
  return "이미지"
}

export async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(CSV_URL, { next: { revalidate: 300 } })
  const text = await res.text()

  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  return data
    .map((row) => {
      const caption = row["caption"] ?? ""
      const comments = toNum(row["commentsCount"])

      const hashtags: string[] = []
      for (let i = 0; i < 10; i++) {
        const h = row[`hashtags/${i}`]
        if (h && h.trim()) hashtags.push(h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`)
        else break
      }

      const impressions = comments > 0 ? comments * 50 : 100
      const reactions = comments
      const engagementRate = impressions > 0 ? +((reactions / impressions) * 100).toFixed(2) : 0

      return {
        date: (row["timestamp"] ?? "").split("T")[0],
        owner: row["ownerUsername"] ?? "",
        ownerFullName: row["ownerFullName"] ?? "",
        caption,
        hashtags,
        comments,
        reactions,
        impressions,
        engagementRate,
        contentType: contentTypeLabel(row["type"] ?? ""),
        ipName: detectIP(caption, hashtags),
        url: row["url"] ?? "",
        displayUrl: row["displayUrl"] ?? row["images/0"] ?? "",
        isVideo: (row["type"] ?? "").toLowerCase() === "video",
      }
    })
    .filter((p) => p.date)
}
