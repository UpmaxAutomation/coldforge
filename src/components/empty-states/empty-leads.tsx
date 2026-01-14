'use client'
import { Users, Plus, Upload } from 'lucide-react'
import Link from 'next/link'

export function EmptyLeads() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">No leads yet</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        Import your leads from a CSV file or add them manually to get started with your outreach.
      </p>
      <div className="flex gap-3">
        <Link
          href="/leads/import"
          className="inline-flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-md hover:bg-primary/5 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Link>
        <Link
          href="/leads/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Lead
        </Link>
      </div>
    </div>
  )
}
