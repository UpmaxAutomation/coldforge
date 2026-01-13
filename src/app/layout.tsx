import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'InstantScale - Cold Email Outreach at Scale',
    template: '%s | InstantScale',
  },
  description: 'The all-in-one platform for cold email at scale. Automate domain setup, warm up accounts, and send personalized campaigns.',
  keywords: ['cold email', 'email outreach', 'email warmup', 'email automation', 'lead generation'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
