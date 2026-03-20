// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'ARIA — AI Senior DevOps Engineer | Step2Dev',
  description: 'Your AI Senior DevOps Engineer with 40 years of experience. Analyzes errors, repos, servers. Real advice, real commands.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'ARIA — AI Senior DevOps Engineer',
    description: 'Fix errors, analyze repos, diagnose servers with AI that has 40 years of DevOps experience.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
      style={{ height: '100%', width: '100%' }}
    >
      <body suppressHydrationWarning style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  )
}
