'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ThumbsUp,
  ThumbsDown,
  Clock,
  X,
  MessageSquare,
  User,
  Mail,
  ChevronDown,
  Check,
  Sparkles,
} from 'lucide-react'
import type { ReplyCategory } from '@/lib/replies'

// Category configuration with colors and icons
export const categoryConfig: Record<ReplyCategory, {
  label: string
  color: string
  bgColor: string
  icon: React.ReactNode
}> = {
  interested: {
    label: 'Interested',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20',
    icon: <ThumbsUp className="h-3 w-3" />,
  },
  not_interested: {
    label: 'Not Interested',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20',
    icon: <ThumbsDown className="h-3 w-3" />,
  },
  out_of_office: {
    label: 'Out of Office',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20',
    icon: <Clock className="h-3 w-3" />,
  },
  unsubscribe: {
    label: 'Unsubscribe',
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10 border-slate-500/20 hover:bg-slate-500/20',
    icon: <X className="h-3 w-3" />,
  },
  meeting_request: {
    label: 'Meeting',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20',
    icon: <MessageSquare className="h-3 w-3" />,
  },
  question: {
    label: 'Question',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20',
    icon: <MessageSquare className="h-3 w-3" />,
  },
  referral: {
    label: 'Referral',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20',
    icon: <User className="h-3 w-3" />,
  },
  bounce: {
    label: 'Bounce',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20',
    icon: <X className="h-3 w-3" />,
  },
  auto_reply: {
    label: 'Auto Reply',
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10 border-slate-400/20 hover:bg-slate-400/20',
    icon: <Mail className="h-3 w-3" />,
  },
  other: {
    label: 'Other',
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10 border-slate-400/20 hover:bg-slate-400/20',
    icon: <Mail className="h-3 w-3" />,
  },
}

interface CategoryBadgeProps {
  category: ReplyCategory
  showIcon?: boolean
  showAI?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * CategoryBadge - Displays a color-coded badge for lead categories
 */
export function CategoryBadge({
  category,
  showIcon = true,
  showAI = false,
  size = 'md',
  className,
}: CategoryBadgeProps) {
  const config = categoryConfig[category] || categoryConfig.other

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0 h-5',
    md: 'text-xs px-2 py-0.5 h-6',
    lg: 'text-sm px-2.5 py-1 h-7',
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium transition-colors',
        config.bgColor,
        config.color,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && config.icon}
      <span>{config.label}</span>
      {showAI && (
        <Sparkles className="h-2.5 w-2.5 opacity-70" />
      )}
    </Badge>
  )
}

interface CategoryBadgeDropdownProps {
  category: ReplyCategory
  onCategoryChange: (category: ReplyCategory) => void
  disabled?: boolean
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * CategoryBadgeDropdown - Badge with dropdown to change category
 */
export function CategoryBadgeDropdown({
  category,
  onCategoryChange,
  disabled = false,
  showIcon = true,
  size = 'md',
  className,
}: CategoryBadgeDropdownProps) {
  const config = categoryConfig[category] || categoryConfig.other

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0 h-5',
    md: 'text-xs px-2 py-0.5 h-6',
    lg: 'text-sm px-2.5 py-1 h-7',
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border font-medium transition-colors cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          config.bgColor,
          config.color,
          sizeClasses[size],
          className
        )}
      >
        {showIcon && config.icon}
        <span>{config.label}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {Object.entries(categoryConfig).map(([key, cfg]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onCategoryChange(key as ReplyCategory)}
            className={cn(
              'flex items-center gap-2 cursor-pointer',
              cfg.color
            )}
          >
            {cfg.icon}
            <span className="flex-1">{cfg.label}</span>
            {category === key && (
              <Check className="h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Get category color for use in other components
 */
export function getCategoryColor(category: ReplyCategory): string {
  return categoryConfig[category]?.color || categoryConfig.other.color
}

/**
 * Get category background color
 */
export function getCategoryBgColor(category: ReplyCategory): string {
  return categoryConfig[category]?.bgColor || categoryConfig.other.bgColor
}

export type { ReplyCategory }
