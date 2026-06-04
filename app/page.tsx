import { fetchPosts } from "@/lib/fetchData"
import Dashboard from "@/components/Dashboard"

export const revalidate = 300

export default async function Home() {
  const posts = await fetchPosts()
  return <Dashboard posts={posts} />
}
