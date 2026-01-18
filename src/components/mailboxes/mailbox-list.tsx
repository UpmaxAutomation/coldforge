'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Mail,
  Search,
  RefreshCw,
  MoreHorizontal,
  Flame,
  Pause,
  Play,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Mailbox {
  id: string
  email: string
  displayName: string
  firstName: string
  lastName: string
  aliases: string[]
  status: string
  warmupStatus: string
  warmupStartedAt: string | null
  warmupCompletedAt: string | null
  emailsSentToday: number
  emailsSentTotal: number
  lastSentAt: string | null
  provisionedAt: string | null
  createdAt: string
  provider: {
    id: string
    provider: string
    domain: string
    config_name: string
  }
}

interface MailboxListProps {
  workspaceId: string
  onSelectMailbox?: (mailbox: Mailbox) => void
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  creating: { label: 'Creating', color: 'bg-blue-100 text-blue-800', icon: RefreshCw },
  active: { label: 'Active', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  suspended: { label: 'Suspended', color: 'bg-orange-100 text-orange-800', icon: Pause },
  deleted: { label: 'Deleted', color: 'bg-gray-100 text-gray-800', icon: Trash2 },
  error: { label: 'Error', color: 'bg-red-100 text-red-800', icon: AlertCircle },
}

const WARMUP_CONFIG = {
  not_started: { label: 'Not Started', color: 'text-gray-500' },
  in_progress: { label: 'Warming', color: 'text-orange-500' },
  completed: { label: 'Warmed', color: 'text-green-500' },
  paused: { label: 'Paused', color: 'text-yellow-500' },
}

export function MailboxList({ workspaceId, onSelectMailbox }: MailboxListProps) {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [warmupFilter, setWarmupFilter] = useState<string>('all')
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  })

  const fetchMailboxes = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        workspaceId,
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      })

      if (searchQuery) params.append('search', searchQuery)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (warmupFilter !== 'all') params.append('warmupStatus', warmupFilter)

      const response = await fetch(`/api/mailboxes/list?${params}`)
      const data = await response.json()

      if (data.mailboxes) {
        setMailboxes(data.mailboxes)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch mailboxes:', error)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, searchQuery, statusFilter, warmupFilter, pagination.limit, pagination.offset])

  useEffect(() => {
    fetchMailboxes()
  }, [fetchMailboxes])

  const handleStatusChange = async (mailboxId: string, newStatus: string) => {
    try {
      await fetch('/api/mailboxes/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailboxId, status: newStatus }),
      })
      fetchMailboxes()
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const handleWarmupStatusChange = async (mailboxId: string, newStatus: string) => {
    try {
      await fetch('/api/mailboxes/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mailboxId, warmupStatus: newStatus }),
      })
      fetchMailboxes()
    } catch (error) {
      console.error('Failed to update warmup status:', error)
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Summary stats
  const stats = {
    total: pagination.total,
    active: mailboxes.filter(m => m.status === 'active').length,
    warming: mailboxes.filter(m => m.warmupStatus === 'in_progress').length,
    warmed: mailboxes.filter(m => m.warmupStatus === 'completed').length,
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Mailboxes
            </CardTitle>
            <CardDescription>
              Manage provisioned mailboxes and warmup status
            </CardDescription>
          </div>
          <Button onClick={fetchMailboxes} variant="outline" size="sm">
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/20 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/20 text-center">
            <p className="text-2xl font-bold text-orange-600">{stats.warming}</p>
            <p className="text-xs text-muted-foreground">Warming</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.warmed}</p>
            <p className="text-xs text-muted-foreground">Warmed</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search mailboxes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select value={warmupFilter} onValueChange={setWarmupFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Warmup" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warmup</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin" />
            <p>Loading mailboxes...</p>
          </div>
        ) : mailboxes.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No mailboxes found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Warmup</TableHead>
                <TableHead>Sent Today</TableHead>
                <TableHead>Total Sent</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mailboxes.map((mailbox) => {
                const statusConfig = STATUS_CONFIG[mailbox.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
                const warmupConfig = WARMUP_CONFIG[mailbox.warmupStatus as keyof typeof WARMUP_CONFIG] || WARMUP_CONFIG.not_started
                const StatusIcon = statusConfig.icon

                return (
                  <TableRow
                    key={mailbox.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectMailbox?.(mailbox)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{mailbox.email}</p>
                        {mailbox.aliases.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            +{mailbox.aliases.length} aliases
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{mailbox.displayName}</TableCell>
                    <TableCell>
                      <Badge className={cn('gap-1', statusConfig.color)}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {mailbox.warmupStatus === 'in_progress' && (
                          <Flame className="h-4 w-4 text-orange-500 animate-pulse" />
                        )}
                        <span className={warmupConfig.color}>{warmupConfig.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>{mailbox.emailsSentToday}</TableCell>
                    <TableCell>{mailbox.emailsSentTotal}</TableCell>
                    <TableCell>{formatDate(mailbox.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {mailbox.warmupStatus === 'in_progress' ? (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleWarmupStatusChange(mailbox.id, 'paused')
                              }}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pause Warmup
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleWarmupStatusChange(mailbox.id, 'in_progress')
                              }}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Start Warmup
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {mailbox.status === 'active' ? (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStatusChange(mailbox.id, 'suspended')
                              }}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Suspend
                            </DropdownMenuItem>
                          ) : mailbox.status === 'suspended' ? (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStatusChange(mailbox.id, 'active')
                              }}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStatusChange(mailbox.id, 'deleted')
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {pagination.total > pagination.limit && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.offset === 0}
                onClick={() => setPagination(p => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => setPagination(p => ({ ...p, offset: p.offset + p.limit }))}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
