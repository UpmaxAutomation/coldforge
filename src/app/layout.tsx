import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/providers/theme-provider'

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
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
