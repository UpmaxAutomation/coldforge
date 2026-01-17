import { Suspense } from 'react'
import { UnifiedInbox } from '@/components/inbox'

function InboxLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left Sidebar Skeleton */}
      <div className="hidden md:flex flex-col w-64 border-r bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted rounded animate-pulse" />
            <div className="h-5 w-16 bg-muted rounded animate-pulse" />
          </div>
        </div>
        {/* Search */}
        <div className="px-3 py-2 border-b">
          <div className="h-9 bg-muted rounded animate-pulse" />
        </div>
        {/* Filters */}
        <div className="p-2 space-y-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-9 bg-muted rounded-lg animate-pulse" />
          ))}
          <div className="h-px bg-muted my-2" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-9 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>

      {/* Middle Panel - Thread List Skeleton */}
      <div className="flex flex-col flex-1 md:w-[350px] lg:w-[400px] md:flex-none border-r">
        {/* Thread list skeleton */}
        <div className="flex-1 overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex border-b p-3" style={{ height: 100 }}>
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="ml-3 flex-1 space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-12 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
                <div className="h-3 w-full bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Empty State Skeleton */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-muted/10">
        <div className="text-center">
          <div className="mx-auto rounded-full bg-muted p-4 w-16 h-16 animate-pulse" />
          <div className="mt-4 h-5 w-40 mx-auto bg-muted rounded animate-pulse" />
          <div className="mt-2 h-4 w-56 mx-auto bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxLoading />}>
      <UnifiedInbox />
    </Suspense>
  )
}
