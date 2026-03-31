import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LP工数管理',
  description: 'ランディングページ案件管理システム',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
