export const siteConfig = {
  name: 'InstantScale',
  description: 'Cold email outreach platform with infrastructure automation',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  ogImage: '/og.png',
  links: {
    github: 'https://github.com',
  },
}

export const navConfig = {
  mainNav: [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Campaigns', href: '/campaigns' },
    { title: 'Leads', href: '/leads' },
  ],
  sidebarNav: [
    { title: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
    { title: 'Campaigns', href: '/campaigns', icon: 'Send' },
    { title: 'Leads', href: '/leads', icon: 'Users' },
    { title: 'Email Accounts', href: '/accounts', icon: 'Mail' },
    { title: 'Domains', href: '/domains', icon: 'Globe' },
    { title: 'Warmup', href: '/warmup', icon: 'Flame' },
    { title: 'Inbox', href: '/inbox', icon: 'Inbox' },
    { title: 'Analytics', href: '/analytics', icon: 'BarChart3' },
    { title: 'Settings', href: '/settings', icon: 'Settings' },
  ],
}

export const planLimits = {
  starter: {
    emailAccounts: 5,
    leads: 1000,
    emailsPerDay: 500,
    domains: 2,
  },
  pro: {
    emailAccounts: 25,
    leads: 10000,
    emailsPerDay: 5000,
    domains: 10,
  },
  agency: {
    emailAccounts: 100,
    leads: 100000,
    emailsPerDay: 50000,
    domains: 50,
  },
}
