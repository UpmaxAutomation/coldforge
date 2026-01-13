import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus } from 'lucide-react'

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Accounts</h1>
          <p className="text-muted-foreground">
            Connect and manage your sending accounts
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardHeader>
            <CardTitle className="text-lg">Google Workspace</CardTitle>
            <CardDescription>
              Connect Gmail accounts via OAuth
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">Connect Google</Button>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardHeader>
            <CardTitle className="text-lg">Microsoft 365</CardTitle>
            <CardDescription>
              Connect Outlook accounts via OAuth
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">Connect Microsoft</Button>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardHeader>
            <CardTitle className="text-lg">SMTP / IMAP</CardTitle>
            <CardDescription>
              Connect any email provider manually
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="outline">Add SMTP</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
