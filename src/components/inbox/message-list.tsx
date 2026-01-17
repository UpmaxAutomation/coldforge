'use client'

import * as React from 'react'
import { useCallback, useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Star,
  Loader2,
  Inbox,
} from 'lucide-react'
import { CategoryBadge } from './category-badge'
import type { ReplyCategory } from '@/lib/replies'

// Thread interface for the list
export interface ThreadListItem {
  id: string
  subject: string
  preview: string
  participantEmail: string
  participantName: string | null
  participantAvatar?: string
  lastMessageAt: string
  messageCount: number
  hasUnread: boolean
  isStarred?: boolean
  category: ReplyCategory
  campaign?: {
    id: string
    name: string
  } | null
}

interface MessageListProps {
  threads: ThreadListItem[]
  selectedThreadId?: string | null
  selectedIds?: Set<string>
  onThreadSelect: (thread: ThreadListItem) => void
  onToggleSelect?: (threadId: string) => void
  onToggleStar?: (threadId: string) => void
  isLoading?: boolean
  emptyMessage?: string
  emptyDescription?: string
  className?: string
}

// Virtual list configuration
const ITEM_HEIGHT = 100 // Approximate height of each item
const OVERSCAN = 5 // Number of items to render outside viewport

/**
 * MessageList - Virtualized list of email threads for performance
 */
export function MessageList({
  threads,
  selectedThreadId,
  selectedIds = new Set(),
  onThreadSelect,
  onToggleSelect,
  onToggleStar,
  isLoading = false,
  emptyMessage = 'No conversations',
  emptyDescription = 'Replies from your campaigns will appear here',
  className,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  // Calculate visible range for virtualization
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(
    threads.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  )
  const visibleThreads = threads.slice(startIndex, endIndex)
  const offsetY = startIndex * ITEM_HEIGHT
  const totalHeight = threads.length * ITEM_HEIGHT

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Measure container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Format relative time
  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }, [])

  // Get initials from name or email
  const getInitials = useCallback((name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n?.[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return email?.[0]?.toUpperCase() || '?'
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Empty state
  if (threads.length === 0) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center h-full text-center px-4',
        className
      )}>
        <div className="rounded-full bg-muted p-4">
          <Inbox className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 font-medium">{emptyMessage}</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {emptyDescription}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex-1 overflow-y-auto', className)}
      onScroll={handleScroll}
    >
      {/* Virtual spacer */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
          }}
        >
          {visibleThreads.map((thread) => (
            <MessageListItem
              key={thread.id}
              thread={thread}
              isSelected={selectedThreadId === thread.id}
              isChecked={selectedIds.has(thread.id)}
              onSelect={() => onThreadSelect(thread)}
              onToggleCheck={() => onToggleSelect?.(thread.id)}
              onToggleStar={() => onToggleStar?.(thread.id)}
              formatDate={formatDate}
              getInitials={getInitials}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface MessageListItemProps {
  thread: ThreadListItem
  isSelected: boolean
  isChecked: boolean
  onSelect: () => void
  onToggleCheck?: () => void
  onToggleStar?: () => void
  formatDate: (date: string) => string
  getInitials: (name: string | null, email: string) => string
}

/**
 * MessageListItem - Individual thread item in the list
 */
function MessageListItem({
  thread,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
  onToggleStar,
  formatDate,
  getInitials,
}: MessageListItemProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex cursor-pointer border-b px-3 py-3 transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-primary/5 border-l-2 border-l-primary',
        thread.hasUnread && !isSelected && 'bg-blue-500/5'
      )}
      style={{ height: ITEM_HEIGHT }}
    >
      {/* Checkbox */}
      {onToggleCheck && (
        <div
          className="mr-3 flex items-start pt-1"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCheck()
          }}
        >
          <Checkbox
            checked={isChecked}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
        </div>
      )}

      {/* Avatar */}
      <Avatar className="h-10 w-10 shrink-0">
        {thread.participantAvatar && (
          <AvatarImage src={thread.participantAvatar} alt={thread.participantName || thread.participantEmail} />
        )}
        <AvatarFallback className={cn(
          'text-sm',
          thread.hasUnread && 'font-semibold bg-primary/10'
        )}>
          {getInitials(thread.participantName, thread.participantEmail)}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="ml-3 min-w-0 flex-1 overflow-hidden">
        {/* Top row: Name + Time */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'truncate text-sm',
            thread.hasUnread && 'font-semibold'
          )}>
            {thread.participantName || thread.participantEmail}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDate(thread.lastMessageAt)}
          </span>
        </div>

        {/* Subject */}
        <div className={cn(
          'truncate text-sm mt-0.5',
          thread.hasUnread ? 'font-medium text-foreground' : 'text-muted-foreground'
        )}>
          {thread.subject}
        </div>

        {/* Category + Campaign */}
        <div className="mt-1.5 flex items-center gap-2 overflow-hidden">
          <CategoryBadge
            category={thread.category}
            size="sm"
            showAI
          />
          {thread.campaign && (
            <span className="truncate text-[10px] text-muted-foreground">
              {thread.campaign.name}
            </span>
          )}
        </div>

        {/* Preview */}
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {thread.preview}
        </p>
      </div>

      {/* Right side: Star + Unread indicator */}
      <div className="ml-2 flex flex-col items-center gap-2">
        {/* Star button */}
        {onToggleStar && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onToggleStar()
            }}
          >
            <Star className={cn(
              'h-3.5 w-3.5',
              thread.isStarred
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground'
            )} />
          </Button>
        )}

        {/* Unread indicator */}
        {thread.hasUnread && (
          <div className="h-2 w-2 rounded-full bg-blue-500" />
        )}
      </div>
    </div>
  )
}

/**
 * MessageListSkeleton - Loading skeleton for the message list
 */
export function MessageListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex-1 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex border-b p-3" style={{ height: ITEM_HEIGHT }}>
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
  )
}
