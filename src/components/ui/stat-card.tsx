'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'

const statCardVariants = cva(
  'group relative overflow-hidden rounded-xl transition-all duration-300 cursor-pointer',
  {
    variants: {
      variant: {
        default: [
          'bg-card border border-border/50',
          'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
        ].join(' '),
        gradient: [
          'bg-gradient-to-br from-card via-card to-muted/30',
          'border border-border/30',
          'hover:border-primary/30 hover:shadow-lg',
        ].join(' '),
        glass: [
          'bg-card/50 backdrop-blur-md',
          'border border-white/10',
          'hover:bg-card/60',
        ].join(' '),
        colored: 'border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

type TrendDirection = 'up' | 'down' | 'neutral'

export interface StatCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statCardVariants> {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: {
    value: number
    direction: TrendDirection
    label?: string
  }
  color?: 'default' | 'purple' | 'blue' | 'green' | 'orange' | 'red'
  loading?: boolean
  onClick?: () => void
}

const colorStyles = {
  default: {
    icon: 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary',
    trend: {
      up: 'text-emerald-500',
      down: 'text-red-500',
      neutral: 'text-muted-foreground',
    },
    glow: '',
    border: '',
  },
  purple: {
    icon: 'bg-primary/10 text-primary',
    trend: {
      up: 'text-emerald-500',
      down: 'text-red-500',
      neutral: 'text-muted-foreground',
    },
    glow: 'group-hover:shadow-primary/10',
    border: 'border-primary/20',
  },
  blue: {
    icon: 'bg-blue-500/10 text-blue-500',
    trend: {
      up: 'text-emerald-500',
      down: 'text-red-500',
      neutral: 'text-muted-foreground',
    },
    glow: 'group-hover:shadow-blue-500/10',
    border: 'border-blue-500/20',
  },
  green: {
    icon: 'bg-emerald-500/10 text-emerald-500',
    trend: {
      up: 'text-emerald-500',
      down: 'text-red-500',
      neutral: 'text-muted-foreground',
    },
    glow: 'group-hover:shadow-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  orange: {
    icon: 'bg-orange-500/10 text-orange-500',
    trend: {
      up: 'text-emerald-500',
      down: 'text-red-500',
      neutral: 'text-muted-foreground',
    },
    glow: 'group-hover:shadow-orange-500/10',
    border: 'border-orange-500/20',
  },
  red: {
    icon: 'bg-red-500/10 text-red-500',
    trend: {
      up: 'text-emerald-500',
      down: 'text-red-500',
      neutral: 'text-muted-foreground',
    },
    glow: 'group-hover:shadow-red-500/10',
    border: 'border-red-500/20',
  },
}

// Animated number component
function AnimatedNumber({ value }: { value: string | number }) {
  const [displayed, setDisplayed] = React.useState(value)

  React.useEffect(() => {
    setDisplayed(value)
  }, [value])

  return (
    <span className="tabular-nums transition-all duration-300">
      {displayed}
    </span>
  )
}

// Trend indicator component
function TrendIndicator({
  value,
  direction,
  label,
  color,
}: {
  value: number
  direction: TrendDirection
  label?: string
  color: 'default' | 'purple' | 'blue' | 'green' | 'orange' | 'red'
}) {
  const TrendIcon =
    direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus

  const styles = colorStyles[color]

  return (
    <div
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        styles.trend[direction]
      )}
    >
      <TrendIcon className="h-3 w-3" />
      <span>
        {direction !== 'neutral' && (direction === 'up' ? '+' : '-')}
        {Math.abs(value)}%
      </span>
      {label && (
        <span className="text-muted-foreground font-normal">{label}</span>
      )}
    </div>
  )
}

// Skeleton loader
function StatCardSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 bg-muted rounded" />
        <div className="h-10 w-10 bg-muted rounded-lg" />
      </div>
      <div className="space-y-2">
        <div className="h-8 w-20 bg-muted rounded" />
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
    </div>
  )
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      className,
      variant,
      title,
      value,
      description,
      icon: Icon,
      trend,
      color = 'default',
      loading = false,
      onClick,
      ...props
    },
    ref
  ) => {
    const styles = colorStyles[color]

    if (loading) {
      return (
        <div
          ref={ref}
          className={cn(
            statCardVariants({ variant }),
            variant === 'colored' && styles.border,
            styles.glow,
            className
          )}
          {...props}
        >
          <StatCardSkeleton />
        </div>
      )
    }

    return (
      <div
        ref={ref}
        className={cn(
          statCardVariants({ variant }),
          variant === 'colored' && styles.border,
          styles.glow,
          className
        )}
        onClick={onClick}
        {...props}
      >
        {/* Decorative gradient blob */}
        <div className="absolute -top-12 -right-12 h-24 w-24 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="relative p-6">
          {/* Header: Title and Icon */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>

              {/* Value with animation */}
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold tracking-tight">
                  <AnimatedNumber value={value} />
                </h3>

                {/* Trend indicator */}
                {trend && (
                  <TrendIndicator
                    value={trend.value}
                    direction={trend.direction}
                    label={trend.label}
                    color={color}
                  />
                )}
              </div>
            </div>

            {/* Icon */}
            {Icon && (
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-lg transition-all duration-200',
                  styles.icon
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            )}
          </div>

          {/* Description/Action row */}
          {description && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{description}</p>
              {onClick && (
                <ArrowRight className="h-4 w-4 text-muted-foreground/50 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }
)
StatCard.displayName = 'StatCard'

// Compact stat card variant for smaller displays
export interface CompactStatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  color?: 'default' | 'purple' | 'blue' | 'green' | 'orange' | 'red'
  className?: string
}

function CompactStatCard({
  label,
  value,
  icon: Icon,
  color = 'default',
  className,
}: CompactStatCardProps) {
  const styles = colorStyles[color]

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50',
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md',
            styles.icon
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// Stat card row for horizontal layouts
interface StatCardRowProps {
  children: React.ReactNode
  className?: string
}

function StatCardRow({ children, className }: StatCardRowProps) {
  return (
    <div
      className={cn(
        'grid gap-4 stagger-children',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  )
}

export { StatCard, CompactStatCard, StatCardRow, StatCardSkeleton }
