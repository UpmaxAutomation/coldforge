'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function MicrosoftConnectButton() {
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/microsoft')
      const data = await response.json()

      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        toast.error('Failed to initiate Microsoft connection', {
          description: data.error || 'Unknown error',
        })
      }
    } catch {
      toast.error('Failed to connect', {
        description: 'Could not connect to the server',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={loading}
      variant="outline"
      className="w-full justify-start gap-3 h-14"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#00A4EF" d="M1 13h10v10H1z" />
        <path fill="#7FBA00" d="M13 1h10v10H13z" />
        <path fill="#FFB900" d="M13 13h10v10H13z" />
      </svg>
      <div className="text-left">
        <div className="font-medium">{loading ? 'Connecting...' : 'Connect Microsoft Account'}</div>
        <div className="text-xs text-muted-foreground">Outlook, Microsoft 365</div>
      </div>
    </Button>
  )
}
