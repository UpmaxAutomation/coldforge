import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, ShoppingCart } from 'lucide-react'

export default function DomainsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Domains</h1>
          <p className="text-muted-foreground">
            Manage your sending domains and DNS configuration
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Buy Domain
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Domain
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>No domains yet</CardTitle>
          <CardDescription>
            Add a domain to configure SPF, DKIM, DMARC, and BIMI records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You can purchase domains directly through Cloudflare, Namecheap, or Porkbun,
            or add an existing domain you already own.
          </p>
          <div className="flex gap-2">
            <Button variant="outline">
              <ShoppingCart className="mr-2 h-4 w-4" />
              Buy Domain
            </Button>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Existing
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
