import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "🇯🇵 일본 IP 콜라보 성과 대시보드",
  description: "Instagram 해시태그 기반 콜라보 반응도 분석",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
