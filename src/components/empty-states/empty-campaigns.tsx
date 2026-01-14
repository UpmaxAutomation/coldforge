'use client'
import { Mail, Plus } from 'lucide-react'
import Link from 'next/link'

export function EmptyCampaigns() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <Mail className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">No campaigns yet</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Create your first email campaign to start reaching out to your leads automatically.
      </p>
      <Link
        href="/campaigns/new"
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create Campaign
      </Link>
    </div>
  )
}
