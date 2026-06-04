import { fetchPosts } from "@/lib/fetchData"
import Dashboard from "@/components/Dashboard"

export const revalidate = 300

export default async function Home() {
  const posts = await fetchPosts()
  const fetchedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Tokyo",
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }) + " JST"

  return <Dashboard posts={posts} fetchedAt={fetchedAt} />
}
