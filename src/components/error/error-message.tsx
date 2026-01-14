'use client'

import { AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ErrorType = 'error' | 'warning' | 'info' | 'destructive'

interface ErrorMessageProps {
  title?: string
  message: string
  type?: ErrorType
  className?: string
  showIcon?: boolean
}

const iconMap = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  destructive: AlertCircle,
}

const styleMap = {
  error: 'bg-destructive/10 border-destructive/20 text-destructive',
  warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-500',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-500',
  destructive: 'bg-destructive/10 border-destructive/20 text-destructive',
}

export function ErrorMessage({
  title,
  message,
  type = 'error',
  className,
  showIcon = true,
}: ErrorMessageProps) {
  const Icon = iconMap[type]

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4',
        styleMap[type],
        className
      )}
      role="alert"
    >
      {showIcon && <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />}
      <div className="flex-1 space-y-1">
        {title && <p className="font-semibold text-sm">{title}</p>}
        <p className="text-sm opacity-90">{message}</p>
      </div>
    </div>
  )
}

interface InlineErrorProps {
  message: string
  className?: string
}

export function InlineError({ message, className }: InlineErrorProps) {
  return (
    <p className={cn('text-sm text-destructive mt-1', className)} role="alert">
      {message}
    </p>
  )
}

interface ApiErrorProps {
  error: Error | string | null | undefined
  className?: string
}

export function ApiError({ error, className }: ApiErrorProps) {
  if (!error) return null

  const message = typeof error === 'string' ? error : error.message

  return (
    <ErrorMessage
      type="error"
      message={message}
      className={className}
    />
  )
}
