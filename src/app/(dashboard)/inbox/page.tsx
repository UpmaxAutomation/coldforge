import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground">
          Unified inbox for all your campaign replies
        </p>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="interested">Interested</TabsTrigger>
          <TabsTrigger value="not-interested">Not Interested</TabsTrigger>
          <TabsTrigger value="ooo">Out of Office</TabsTrigger>
          <TabsTrigger value="unsubscribe">Unsubscribe</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>No replies yet</CardTitle>
              <CardDescription>
                Replies from your campaigns will appear here
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Start a campaign to receive replies from your leads.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="interested">
          <Card>
            <CardHeader>
              <CardTitle>Interested Leads</CardTitle>
              <CardDescription>
                Leads who showed interest in your outreach
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No interested replies yet.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="not-interested">
          <Card>
            <CardHeader>
              <CardTitle>Not Interested</CardTitle>
              <CardDescription>
                Leads who declined your offer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No negative replies yet.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ooo">
          <Card>
            <CardHeader>
              <CardTitle>Out of Office</CardTitle>
              <CardDescription>
                Automatic out-of-office responses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No OOO replies yet.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="unsubscribe">
          <Card>
            <CardHeader>
              <CardTitle>Unsubscribe Requests</CardTitle>
              <CardDescription>
                Leads who requested to be removed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No unsubscribe requests yet.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
