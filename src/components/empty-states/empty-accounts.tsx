'use client'
import { AtSign, Plus } from 'lucide-react'
import Link from 'next/link'

export function EmptyAccounts() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <AtSign className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">No email accounts connected</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Connect your email accounts to start sending campaigns. We support Gmail, Outlook, and custom SMTP.
      </p>
      <Link
        href="/accounts/connect"
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Connect Account
      </Link>
    </div>
  )
}
