import { Suspense } from 'react'
import AccountsContent from './accounts-content'

export default function AccountsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Email Accounts</h1>
            <p className="text-muted-foreground">
              Connect and manage your email accounts for sending campaigns
            </p>
          </div>
        </div>
        <div className="animate-pulse text-muted-foreground">Loading accounts...</div>
      </div>
    }>
      <AccountsContent />
    </Suspense>
  )
}
