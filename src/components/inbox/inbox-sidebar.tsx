'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Inbox,
  Mail,
  Star,
  Archive,
  ThumbsUp,
  ThumbsDown,
  Clock,
  MessageSquare,
  X,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { ReplyCategory } from '@/lib/replies'
import { categoryConfig } from './category-badge'

// Filter types
export type InboxFilter = 'all' | 'unread' | 'starred' | 'archived' | ReplyCategory

export interface InboxStats {
  total: number
  unread: number
  starred: number
  archived: number
  interested: number
  notInterested: number
  outOfOffice: number
  meetingRequest: number
  question: number
  unsubscribe: number
}

export interface EmailAccount {
  id: string
  email: string
  name?: string
  unreadCount: number
}

interface InboxSidebarProps {
  activeFilter: InboxFilter
  onFilterChange: (filter: InboxFilter) => void
  stats: InboxStats | null
  accounts?: EmailAccount[]
  selectedAccountId?: string | null
  onAccountSelect?: (accountId: string | null) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onRefresh?: () => void
  isLoading?: boolean
  className?: string
}

// Filter item configuration
const mainFilters = [
  { id: 'all', label: 'All Messages', icon: Inbox, statKey: 'total' },
  { id: 'unread', label: 'Unread', icon: Mail, statKey: 'unread' },
  { id: 'starred', label: 'Starred', icon: Star, statKey: 'starred' },
  { id: 'archived', label: 'Archived', icon: Archive, statKey: 'archived' },
] as const

const categoryFilters = [
  { id: 'interested', label: 'Interested', icon: ThumbsUp, statKey: 'interested', color: 'text-emerald-500' },
  { id: 'not_interested', label: 'Not Interested', icon: ThumbsDown, statKey: 'notInterested', color: 'text-red-500' },
  { id: 'out_of_office', label: 'Out of Office', icon: Clock, statKey: 'outOfOffice', color: 'text-amber-500' },
  { id: 'meeting_request', label: 'Meeting Request', icon: MessageSquare, statKey: 'meetingRequest', color: 'text-blue-500' },
  { id: 'question', label: 'Question', icon: MessageSquare, statKey: 'question', color: 'text-purple-500' },
  { id: 'unsubscribe', label: 'Unsubscribe', icon: X, statKey: 'unsubscribe', color: 'text-slate-500' },
] as const

/**
 * InboxSidebar - Filter sidebar for the inbox with category filters and account selection
 */
export function InboxSidebar({
  activeFilter,
  onFilterChange,
  stats,
  accounts = [],
  selectedAccountId,
  onAccountSelect,
  searchQuery,
  onSearchChange,
  onRefresh,
  isLoading = false,
  className,
}: InboxSidebarProps) {
  const [categoriesOpen, setCategoriesOpen] = React.useState(true)
  const [accountsOpen, setAccountsOpen] = React.useState(true)

  const getStatValue = (key: keyof InboxStats): number => {
    if (!stats) return 0
    return stats[key] || 0
  }

  return (
    <div className={cn(
      'flex flex-col h-full bg-card border-r',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Inbox</h2>
          {stats?.unread ? (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {stats.unread}
            </Badge>
          ) : null}
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-8 w-8"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 bg-muted/50"
          />
        </div>
      </div>

      {/* Filters */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Main Filters */}
          {mainFilters.map((filter) => {
            const count = getStatValue(filter.statKey)
            const isActive = activeFilter === filter.id

            return (
              <button
                key={filter.id}
                onClick={() => onFilterChange(filter.id as InboxFilter)}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                  'hover:bg-muted',
                  isActive && 'bg-primary/10 text-primary font-medium'
                )}
              >
                <filter.icon className={cn(
                  'h-4 w-4',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )} />
                <span className="flex-1 text-left">{filter.label}</span>
                {count > 0 && (
                  <span className={cn(
                    'text-xs tabular-nums',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}

          <Separator className="my-2" />

          {/* Category Filters */}
          <Collapsible open={categoriesOpen} onOpenChange={setCategoriesOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                <Filter className="h-3 w-3" />
                <span className="flex-1 text-left">Categories</span>
                {categoriesOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1">
              {categoryFilters.map((filter) => {
                const count = getStatValue(filter.statKey)
                const isActive = activeFilter === filter.id

                return (
                  <button
                    key={filter.id}
                    onClick={() => onFilterChange(filter.id as InboxFilter)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                      'hover:bg-muted',
                      isActive && 'bg-primary/10 font-medium'
                    )}
                  >
                    <filter.icon className={cn(
                      'h-4 w-4',
                      isActive ? filter.color : 'text-muted-foreground'
                    )} />
                    <span className={cn(
                      'flex-1 text-left',
                      isActive && filter.color
                    )}>
                      {filter.label}
                    </span>
                    {count > 0 && (
                      <span className={cn(
                        'text-xs tabular-nums',
                        isActive ? filter.color : 'text-muted-foreground'
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </CollapsibleContent>
          </Collapsible>

          {/* Email Accounts */}
          {accounts.length > 0 && (
            <>
              <Separator className="my-2" />

              <Collapsible open={accountsOpen} onOpenChange={setAccountsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="h-3 w-3" />
                    <span className="flex-1 text-left">Accounts</span>
                    {accountsOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1">
                  <button
                    onClick={() => onAccountSelect?.(null)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                      'hover:bg-muted',
                      !selectedAccountId && 'bg-primary/10 text-primary font-medium'
                    )}
                  >
                    <Mail className="h-4 w-4" />
                    <span className="flex-1 text-left">All Accounts</span>
                  </button>
                  {accounts.map((account) => {
                    const isActive = selectedAccountId === account.id

                    return (
                      <button
                        key={account.id}
                        onClick={() => onAccountSelect?.(account.id)}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                          'hover:bg-muted',
                          isActive && 'bg-primary/10 text-primary font-medium'
                        )}
                      >
                        <div className={cn(
                          'flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {account.email?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="truncate text-sm">
                            {account.name || account.email.split('@')[0]}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {account.email}
                          </div>
                        </div>
                        {account.unreadCount > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            {account.unreadCount}
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-3 py-2 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {stats?.total || 0} conversations
          </span>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Re-export for convenience
export { categoryConfig }
