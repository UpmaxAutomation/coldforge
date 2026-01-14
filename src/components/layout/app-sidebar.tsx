'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Send,
  Users,
  Mail,
  Globe,
  Flame,
  Inbox,
  BarChart3,
  Settings,
  Zap,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  HelpCircle,
  Bell,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const navigationItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Overview & analytics',
  },
  {
    title: 'Campaigns',
    href: '/campaigns',
    icon: Send,
    description: 'Email sequences',
    badge: null,
  },
  {
    title: 'Leads',
    href: '/leads',
    icon: Users,
    description: 'Manage prospects',
  },
  {
    title: 'Email Accounts',
    href: '/accounts',
    icon: Mail,
    description: 'Connected accounts',
  },
  {
    title: 'Domains',
    href: '/domains',
    icon: Globe,
    description: 'Domain settings',
  },
  {
    title: 'Warmup',
    href: '/warmup',
    icon: Flame,
    description: 'Email warmup',
    badge: 'Active',
    badgeColor: 'bg-emerald-500/20 text-emerald-400',
  },
  {
    title: 'Inbox',
    href: '/inbox',
    icon: Inbox,
    description: 'Unified inbox',
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    description: 'Performance metrics',
  },
]

const bottomItems = [
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'App settings',
  },
  {
    title: 'Help & Support',
    href: '/help',
    icon: HelpCircle,
    description: 'Get help',
  },
]

function NavItem({
  item,
  isActive,
  isCollapsed
}: {
  item: typeof navigationItems[0]
  isActive: boolean
  isCollapsed: boolean
}) {
  const content = (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        isCollapsed && "justify-center px-2"
      )}
    >
      {/* Active indicator */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-gradient-to-b from-primary to-primary/70" />
      )}

      {/* Icon container with glow effect on active */}
      <span className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all duration-200",
        isActive
          ? "bg-primary/15 text-primary shadow-[0_0_12px_rgba(var(--primary),0.15)]"
          : "text-muted-foreground group-hover:text-foreground group-hover:bg-accent"
      )}>
        <item.icon className="h-4 w-4" />
      </span>

      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{item.title}</span>

          {/* Badge */}
          {item.badge && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              item.badgeColor || "bg-primary/20 text-primary"
            )}>
              {item.badge}
            </span>
          )}

          {/* Hover arrow indicator */}
          <ChevronRight className={cn(
            "h-4 w-4 text-muted-foreground/50 transition-all duration-200",
            "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0",
            isActive && "opacity-100 translate-x-0 text-primary/50"
          )} />
        </>
      )}
    </Link>
  )

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          <span>{item.title}</span>
          {item.badge && (
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              item.badgeColor || "bg-primary/20 text-primary"
            )}>
              {item.badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}

export function AppSidebar() {
  const pathname = usePathname()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  return (
    <Sidebar className="border-r-0">
      {/* Sidebar background with glassmorphism */}
      <div className="absolute inset-0 glass-sidebar" />

      {/* Content wrapper */}
      <div className="relative z-10 flex h-full flex-col">
        {/* Header with logo */}
        <SidebarHeader className={cn(
          "border-b border-border/50 px-4 py-4",
          isCollapsed && "px-2"
        )}>
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 transition-all duration-200",
              isCollapsed && "justify-center"
            )}
          >
            {/* Logo icon with gradient background */}
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/40 to-primary/20 blur-md" />
              <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
            </div>

            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight">
                  Instant<span className="text-primary">Scale</span>
                </span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Cold Email Platform
                </span>
              </div>
            )}
          </Link>
        </SidebarHeader>

        {/* Navigation content */}
        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Main Menu
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent className="mt-2">
              <nav className="flex flex-col gap-1">
                {navigationItems.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
                    isCollapsed={isCollapsed}
                  />
                ))}
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Divider with gradient */}
          <div className={cn(
            "my-4 h-px bg-gradient-to-r from-transparent via-border to-transparent",
            isCollapsed && "mx-2"
          )} />

          {/* Bottom navigation */}
          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                System
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent className="mt-2">
              <nav className="flex flex-col gap-1">
                {bottomItems.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    isActive={pathname === item.href}
                    isCollapsed={isCollapsed}
                  />
                ))}
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer with upgrade CTA */}
        <SidebarFooter className="mt-auto border-t border-border/50 p-4">
          {!isCollapsed ? (
            <div className="space-y-3">
              {/* Upgrade card */}
              <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
                {/* Decorative elements */}
                <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-primary/10 blur-xl" />
                <div className="absolute -bottom-4 -left-4 h-12 w-12 rounded-full bg-primary/5 blur-lg" />

                <div className="relative">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Upgrade to Pro</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Unlock unlimited campaigns and advanced analytics
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 w-full btn-gradient text-xs"
                  >
                    Upgrade Now
                  </Button>
                </div>
              </div>

              {/* Version info */}
              <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground/50">
                <span>InstantScale v1.0</span>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>All systems operational</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Upgrade to Pro
                </TooltipContent>
              </Tooltip>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </div>
          )}
        </SidebarFooter>
      </div>

      {/* Rail for collapse/expand */}
      <SidebarRail />
    </Sidebar>
  )
}
