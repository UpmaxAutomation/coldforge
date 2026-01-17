'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const gradientCardVariants = cva(
  'relative overflow-hidden rounded-xl transition-all duration-300',
  {
    variants: {
      variant: {
        default: [
          'bg-card',
          'before:absolute before:inset-0 before:rounded-xl before:p-[1px]',
          'before:bg-gradient-to-br before:from-primary/20 before:via-transparent before:to-primary/10',
          'before:mask-[linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]',
          'before:-webkit-mask-composite-xor before:mask-composite-exclude',
          'before:pointer-events-none',
        ].join(' '),
        primary: [
          'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent',
          'border border-primary/20',
        ].join(' '),
        secondary: [
          'bg-gradient-to-br from-secondary/50 via-secondary/30 to-transparent',
          'border border-border/50',
        ].join(' '),
        ghost: [
          'bg-transparent',
          'border border-border/50 hover:border-border',
        ].join(' '),
        glow: [
          'bg-card',
          'before:absolute before:inset-0 before:rounded-xl before:p-[1px]',
          'before:bg-gradient-to-br before:from-primary/40 before:via-primary/20 before:to-primary/40',
          'before:mask-[linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]',
          'before:-webkit-mask-composite-xor before:mask-composite-exclude',
          'before:pointer-events-none',
          'shadow-[0_0_30px_rgba(var(--primary),0.15)]',
        ].join(' '),
        glass: [
          'bg-card/40 backdrop-blur-xl',
          'border border-white/10',
        ].join(' '),
      },
      hover: {
        default: 'hover:shadow-lg hover:-translate-y-0.5',
        lift: 'hover:shadow-xl hover:-translate-y-1',
        glow: 'hover:shadow-[0_0_30px_rgba(var(--primary),0.2)]',
        border: 'hover:border-primary/50',
        none: '',
      },
      size: {
        default: 'p-6',
        sm: 'p-4',
        lg: 'p-8',
        none: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      hover: 'default',
      size: 'default',
    },
  }
)

export interface GradientCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof gradientCardVariants> {
  children: React.ReactNode
  asChild?: boolean
}

const GradientCard = React.forwardRef<HTMLDivElement, GradientCardProps>(
  ({ className, variant, hover, size, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(gradientCardVariants({ variant, hover, size }), className)}
        {...props}
      >
        {/* Inner content wrapper */}
        <div className="relative z-10">{children}</div>
      </div>
    )
  }
)
GradientCard.displayName = 'GradientCard'

// Gradient Card Header
type GradientCardHeaderProps = React.HTMLAttributes<HTMLDivElement>

const GradientCardHeader = React.forwardRef<HTMLDivElement, GradientCardHeaderProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col space-y-1.5', className)}
        {...props}
      />
    )
  }
)
GradientCardHeader.displayName = 'GradientCardHeader'

// Gradient Card Title
interface GradientCardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  gradient?: boolean
}

const GradientCardTitle = React.forwardRef<HTMLHeadingElement, GradientCardTitleProps>(
  ({ className, gradient = false, children, ...props }, ref) => {
    return (
      <h3
        ref={ref}
        className={cn(
          'text-lg font-semibold leading-none tracking-tight',
          gradient && 'text-gradient',
          className
        )}
        {...props}
      >
        {children}
      </h3>
    )
  }
)
GradientCardTitle.displayName = 'GradientCardTitle'

// Gradient Card Description
type GradientCardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>

const GradientCardDescription = React.forwardRef<HTMLParagraphElement, GradientCardDescriptionProps>(
  ({ className, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn('text-sm text-muted-foreground', className)}
        {...props}
      />
    )
  }
)
GradientCardDescription.displayName = 'GradientCardDescription'

// Gradient Card Content
type GradientCardContentProps = React.HTMLAttributes<HTMLDivElement>

const GradientCardContent = React.forwardRef<HTMLDivElement, GradientCardContentProps>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn('pt-4', className)} {...props} />
  }
)
GradientCardContent.displayName = 'GradientCardContent'

// Gradient Card Footer
type GradientCardFooterProps = React.HTMLAttributes<HTMLDivElement>

const GradientCardFooter = React.forwardRef<HTMLDivElement, GradientCardFooterProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex items-center pt-4', className)}
        {...props}
      />
    )
  }
)
GradientCardFooter.displayName = 'GradientCardFooter'

// Decorative background blob component for use inside cards
interface CardBlobProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center'
  color?: 'primary' | 'secondary' | 'accent'
  size?: 'sm' | 'md' | 'lg'
}

function CardBlob({
  position = 'top-right',
  color = 'primary',
  size = 'md',
}: CardBlobProps) {
  const positionClasses = {
    'top-right': '-top-8 -right-8',
    'top-left': '-top-8 -left-8',
    'bottom-right': '-bottom-8 -right-8',
    'bottom-left': '-bottom-8 -left-8',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  }

  const colorClasses = {
    primary: 'bg-primary/20',
    secondary: 'bg-secondary/30',
    accent: 'bg-chart-2/20',
  }

  const sizeClasses = {
    sm: 'h-16 w-16',
    md: 'h-24 w-24',
    lg: 'h-32 w-32',
  }

  return (
    <div
      className={cn(
        'absolute rounded-full blur-2xl pointer-events-none',
        positionClasses[position],
        colorClasses[color],
        sizeClasses[size]
      )}
    />
  )
}

export {
  GradientCard,
  GradientCardHeader,
  GradientCardTitle,
  GradientCardDescription,
  GradientCardContent,
  GradientCardFooter,
  CardBlob,
  gradientCardVariants,
}
