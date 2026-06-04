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
}

const HASHTAG_IP_MAP: Record<string, string> = {
  コラボ商品: "콜라보_공통",
  IPコラボ: "콜라보_공통",
  キャラコラボ: "콜라보_공통",
  コラボグッズ: "콜라보_공통",
  コラボ: "콜라보_공통",
}

function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""))
  return isNaN(n) ? 0 : n
}

function detectIP(caption: string, hashtags: string[]): string {
  const text = caption + " " + hashtags.join(" ")
  for (const [tag, ip] of Object.entries(HASHTAG_IP_MAP)) {
    if (text.includes(tag)) return ip
  }
  return "기타"
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

      // 해시태그: hashtags/0, hashtags/1 ... 컬럼에서 수집
      const hashtags: string[] = []
      for (let i = 0; i < 10; i++) {
        const h = row[`hashtags/${i}`]
        if (h && h.trim()) hashtags.push(h.trim().startsWith("#") ? h.trim() : `#${h.trim()}`)
        else break
      }

      // 노출수 추정: 댓글 × 50 (좋아요 데이터 없음)
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
        displayUrl: row["displayUrl"] ?? "",
      }
    })
    .filter((p) => p.date)
}
