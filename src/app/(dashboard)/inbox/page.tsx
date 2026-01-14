import { Suspense } from 'react'
import InboxContent from './inbox-content'

function InboxLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left Panel Skeleton */}
      <div className="flex flex-col flex-1 md:w-[400px] lg:w-[450px] md:flex-none border-r">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted rounded animate-pulse" />
            <div className="h-5 w-16 bg-muted rounded animate-pulse" />
          </div>
        </div>

        {/* Search */}
        <div className="border-b px-3 py-2">
          <div className="h-9 bg-muted rounded animate-pulse" />
        </div>

        {/* Tabs */}
        <div className="border-b px-2 py-2">
          <div className="h-8 bg-muted rounded animate-pulse" />
        </div>

        {/* Thread list skeleton */}
        <div className="flex-1 overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex border-b p-3">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="ml-3 flex-1 space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                <div className="h-3 w-full bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel Skeleton (hidden on mobile) */}
      <div className="hidden md:flex flex-1 items-center justify-center bg-muted/10">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto bg-muted rounded animate-pulse" />
          <div className="mt-4 h-5 w-40 mx-auto bg-muted rounded animate-pulse" />
          <div className="mt-1 h-4 w-56 mx-auto bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxLoading />}>
      <InboxContent />
    </Suspense>
  )
}
