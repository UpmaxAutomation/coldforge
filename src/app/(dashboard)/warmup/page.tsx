import { Suspense } from 'react'
import WarmupContent from './warmup-content'
import { Card, CardContent } from '@/components/ui/card'
import { RefreshCw } from 'lucide-react'

function WarmupLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Warmup</h1>
        <p className="text-muted-foreground">
          Warm up your email accounts to improve deliverability and sender reputation
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="py-6">
              <div className="h-4 w-24 bg-muted rounded mb-2" />
              <div className="h-8 w-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="py-10">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function WarmupPage() {
  return (
    <Suspense fallback={<WarmupLoading />}>
      <WarmupContent />
    </Suspense>
  )
}
