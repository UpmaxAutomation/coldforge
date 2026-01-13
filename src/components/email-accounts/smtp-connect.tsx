'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Mail, Server } from 'lucide-react'
import { toast } from 'sonner'

interface SmtpConnectProps {
  onSuccess: () => void
}

const SMTP_PRESETS = [
  { value: 'custom', label: 'Custom SMTP', smtp: { host: '', port: 587 }, imap: { host: '', port: 993 } },
  { value: 'gmail', label: 'Gmail (App Password)', smtp: { host: 'smtp.gmail.com', port: 587 }, imap: { host: 'imap.gmail.com', port: 993 } },
  { value: 'outlook', label: 'Outlook.com', smtp: { host: 'smtp.office365.com', port: 587 }, imap: { host: 'outlook.office365.com', port: 993 } },
  { value: 'yahoo', label: 'Yahoo Mail', smtp: { host: 'smtp.mail.yahoo.com', port: 587 }, imap: { host: 'imap.mail.yahoo.com', port: 993 } },
  { value: 'zoho', label: 'Zoho Mail', smtp: { host: 'smtp.zoho.com', port: 587 }, imap: { host: 'imap.zoho.com', port: 993 } },
]

export function SmtpConnectDialog({ onSuccess }: SmtpConnectProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [preset, setPreset] = useState('custom')

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpSecure, setSmtpSecure] = useState(false)

  const [enableImap, setEnableImap] = useState(true)
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState('993')
  const [imapUser, setImapUser] = useState('')
  const [imapPassword, setImapPassword] = useState('')

  const handlePresetChange = (value: string) => {
    setPreset(value)
    const selectedPreset = SMTP_PRESETS.find(p => p.value === value)
    if (selectedPreset && value !== 'custom') {
      setSmtpHost(selectedPreset.smtp.host)
      setSmtpPort(selectedPreset.smtp.port.toString())
      setImapHost(selectedPreset.imap.host)
      setImapPort(selectedPreset.imap.port.toString())
    }
  }

  const handleTest = async () => {
    if (!email || !smtpHost || !smtpUser || !smtpPassword) {
      toast.error('Please fill in all required SMTP fields')
      return
    }

    setTesting(true)
    try {
      // First create the account
      const createResponse = await fetch('/api/email-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          provider: 'smtp',
          display_name: displayName || email,
          smtp_host: smtpHost,
          smtp_port: parseInt(smtpPort),
          smtp_user: smtpUser,
          smtp_password: smtpPassword,
          imap_host: enableImap ? imapHost : undefined,
          imap_port: enableImap ? parseInt(imapPort) : undefined,
          imap_user: enableImap ? (imapUser || smtpUser) : undefined,
          imap_password: enableImap ? (imapPassword || smtpPassword) : undefined,
        }),
      })

      const createData = await createResponse.json()

      if (!createResponse.ok) {
        toast.error('Failed to create account', {
          description: createData.error,
        })
        return
      }

      // Test the connection
      const testResponse = await fetch(`/api/email-accounts/${createData.account.id}`, {
        method: 'POST',
      })
      const testData = await testResponse.json()

      if (testData.success) {
        toast.success('Connection successful', {
          description: 'Account added and verified',
        })
        setOpen(false)
        resetForm()
        onSuccess()
      } else {
        // Delete the account if test failed
        await fetch(`/api/email-accounts/${createData.account.id}`, {
          method: 'DELETE',
        })
        toast.error('Connection test failed', {
          description: testData.error,
        })
      }
    } catch (error) {
      toast.error('Failed to test connection')
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async () => {
    if (!email || !smtpHost || !smtpUser || !smtpPassword) {
      toast.error('Please fill in all required SMTP fields')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/email-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          provider: 'smtp',
          display_name: displayName || email,
          smtp_host: smtpHost,
          smtp_port: parseInt(smtpPort),
          smtp_user: smtpUser,
          smtp_password: smtpPassword,
          imap_host: enableImap ? imapHost : undefined,
          imap_port: enableImap ? parseInt(imapPort) : undefined,
          imap_user: enableImap ? (imapUser || smtpUser) : undefined,
          imap_password: enableImap ? (imapPassword || smtpPassword) : undefined,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Account added', {
          description: 'Remember to test the connection',
        })
        setOpen(false)
        resetForm()
        onSuccess()
      } else {
        toast.error('Failed to add account', {
          description: data.error,
        })
      }
    } catch {
      toast.error('Failed to add account')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setPreset('custom')
    setEmail('')
    setDisplayName('')
    setSmtpHost('')
    setSmtpPort('587')
    setSmtpUser('')
    setSmtpPassword('')
    setSmtpSecure(false)
    setEnableImap(true)
    setImapHost('')
    setImapPort('993')
    setImapUser('')
    setImapPassword('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-3 h-14">
          <Server className="h-5 w-5 text-muted-foreground" />
          <div className="text-left">
            <div className="font-medium">Connect SMTP Account</div>
            <div className="text-xs text-muted-foreground">Any email provider</div>
          </div>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Add SMTP Account
          </DialogTitle>
          <DialogDescription>
            Connect any email account using SMTP credentials
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provider Preset</Label>
            <Select value={preset} onValueChange={handlePresetChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMTP_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="John Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </div>

          <Tabs defaultValue="smtp" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="smtp">SMTP (Sending)</TabsTrigger>
              <TabsTrigger value="imap">IMAP (Receiving)</TabsTrigger>
            </TabsList>
            <TabsContent value="smtp" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpHost">SMTP Host *</Label>
                  <Input
                    id="smtpHost"
                    placeholder="smtp.example.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPort">Port *</Label>
                  <Input
                    id="smtpPort"
                    placeholder="587"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpUser">Username *</Label>
                  <Input
                    id="smtpUser"
                    placeholder="you@example.com"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPassword">Password *</Label>
                  <Input
                    id="smtpPassword"
                    type="password"
                    placeholder="••••••••"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="smtpSecure">Use SSL/TLS (port 465)</Label>
                <Switch
                  id="smtpSecure"
                  checked={smtpSecure}
                  onCheckedChange={(checked) => {
                    setSmtpSecure(checked)
                    setSmtpPort(checked ? '465' : '587')
                  }}
                />
              </div>
            </TabsContent>
            <TabsContent value="imap" className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="enableImap">Enable IMAP (for receiving replies)</Label>
                <Switch
                  id="enableImap"
                  checked={enableImap}
                  onCheckedChange={setEnableImap}
                />
              </div>
              {enableImap && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="imapHost">IMAP Host</Label>
                      <Input
                        id="imapHost"
                        placeholder="imap.example.com"
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="imapPort">Port</Label>
                      <Input
                        id="imapPort"
                        placeholder="993"
                        value={imapPort}
                        onChange={(e) => setImapPort(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="imapUser">Username (if different)</Label>
                      <Input
                        id="imapUser"
                        placeholder="Same as SMTP"
                        value={imapUser}
                        onChange={(e) => setImapUser(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="imapPassword">Password (if different)</Label>
                      <Input
                        id="imapPassword"
                        type="password"
                        placeholder="Same as SMTP"
                        value={imapPassword}
                        onChange={(e) => setImapPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing || loading}>
            {testing ? 'Testing...' : 'Test & Add'}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || testing}>
            {loading ? 'Adding...' : 'Add Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
