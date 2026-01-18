import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { DashboardHeader } from '@/components/layout/dashboard-header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user has an organization
  const { data: profile } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  // Redirect to onboarding if no organization
  if (!profile?.organization_id) {
    redirect('/onboarding')
  }

  return (
    <SidebarProvider>
      <div className="relative flex min-h-screen w-full">
        {/* Background gradient */}
        <div className="fixed inset-0 gradient-mesh pointer-events-none" />

        {/* Sidebar */}
        <AppSidebar />

        {/* Main content */}
        <SidebarInset className="relative">
          <DashboardHeader user={user} />
          <main className="flex-1 p-6 animate-fade-in">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
