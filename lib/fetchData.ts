import Papa from "papaparse"

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS5ohtCnyOZNc8d02TchDIIYxix8UUB5rPiylPAxiiBaPBOZalqdCWGNRqWx4JTXoy-byBQFoU795un/pub?output=csv"

export interface Post {
  date: string
  owner: string
  caption: string
  hashtags: string[]
  likes: number
  comments: number
  plays: number
  impressions: number
  reach: number
  reactions: number
  engagementRate: number
  isVideo: boolean
  isPaid: boolean
  url: string
  contentType: string
  ipName: string
}

const HASHTAG_IP_MAP: Record<string, string> = {
  コラボ商品: "콜라보_공통",
  IPコラボ: "콜라보_공통",
  キャラコラボ: "콜라보_공통",
  コラボグッズ: "콜라보_공통",
}

function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""))
  return isNaN(n) ? 0 : n
}

function extractHashtags(caption: string): string[] {
  return (caption.match(/#[\w　-鿿가-힣]+/g) ?? []).slice(0, 8)
}

function detectIP(caption: string): string {
  for (const [tag, ip] of Object.entries(HASHTAG_IP_MAP)) {
    if (caption.includes(tag)) return ip
  }
  return "기타"
}

export async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(CSV_URL, { next: { revalidate: 300 } })
  const text = await res.text()

  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  return data.map((row) => {
    const likes = toNum(row["likeCount"])
    const comments = toNum(row["commentCount"])
    const plays = toNum(row["video/playCount"])
    const isVideo = String(row["isVideo"]).toLowerCase() === "true"
    const impressions = plays > 0 ? plays : likes * 20
    const reach = Math.round(impressions * 0.7)
    const reactions = likes + comments
    const engagementRate = impressions > 0 ? (reactions / impressions) * 100 : 0
    const caption = row["caption"] ?? ""

    return {
      date: row["createdAt"]?.split("T")[0] ?? "",
      owner: row["owner/username"] ?? "",
      caption,
      hashtags: extractHashtags(caption),
      likes,
      comments,
      plays,
      impressions,
      reach,
      reactions,
      engagementRate: Math.round(engagementRate * 100) / 100,
      isVideo,
      isPaid: String(row["isPaidPartnership"]).toLowerCase() === "true",
      url: row["url"] ?? "",
      contentType: isVideo ? "영상/릴스" : "이미지",
      ipName: detectIP(caption),
    }
  }).filter((p) => p.date)
}
