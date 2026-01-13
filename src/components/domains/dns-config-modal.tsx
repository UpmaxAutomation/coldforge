'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle, XCircle, Copy, RefreshCw } from 'lucide-react'

interface DnsRecord {
  type: string
  name: string
  value: string
  ttl: number
  priority?: number
}

interface DnsConfigModalProps {
  open: boolean
  onClose: () => void
  domain: {
    id: string
    domain: string
    dnsStatus?: string
  }
  onSuccess?: () => void
}

export function DnsConfigModal({ open, onClose, domain, onSuccess }: DnsConfigModalProps) {
  const [step, setStep] = useState<'generate' | 'results' | 'configure'>('generate')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generation options
  const [provider, setProvider] = useState<'google' | 'microsoft' | 'custom'>('custom')
  const [dkimSelector, setDkimSelector] = useState('mail')
  const [dmarcEmail, setDmarcEmail] = useState('')
  const [configureSpf, setConfigureSpf] = useState(true)
  const [configureDkim, setConfigureDkim] = useState(true)
  const [configureDmarc, setConfigureDmarc] = useState(true)
  const [configureMx, setConfigureMx] = useState(false)

  // Generated records
  const [records, setRecords] = useState<{
    spf?: DnsRecord
    dkim?: DnsRecord
    dmarc?: DnsRecord
    bimi?: DnsRecord
    mx?: DnsRecord[]
  } | null>(null)
  const [instructions, setInstructions] = useState<string>('')

  // Configuration results
  const [configResults, setConfigResults] = useState<Array<{
    record: string
    success: boolean
    error?: string
  }> | null>(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/dns/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.domain,
          provider,
          dkimSelector,
          dmarcReportEmail: dmarcEmail || `dmarc@${domain.domain}`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate DNS records')
      }

      setRecords(data.records)
      setInstructions(data.instructions)
      setStep('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleConfigure = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/dns/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainId: domain.id,
          provider,
          dkimSelector,
          dmarcReportEmail: dmarcEmail || `dmarc@${domain.domain}`,
          configureSpf,
          configureDkim,
          configureDmarc,
          configureMx
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.needsSetup) {
          setError('Please configure your registrar API credentials first.')
          return
        }
        if (data.manualInstructions) {
          setError('Automatic DNS configuration not available. Please configure records manually.')
          return
        }
        throw new Error(data.error || 'Failed to configure DNS records')
      }

      setConfigResults(data.results)
      setStep('configure')
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const renderRecordRow = (label: string, record: DnsRecord | undefined) => {
    if (!record) return null

    return (
      <div className="space-y-1 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{label}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(record.value)}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Type:</span> {record.type}
          </div>
          <div>
            <span className="text-gray-500">Name:</span> {record.name}
          </div>
          <div>
            <span className="text-gray-500">TTL:</span> {record.ttl}
          </div>
        </div>
        <div className="mt-2">
          <span className="text-gray-500 text-xs">Value:</span>
          <code className="block text-xs bg-white p-2 rounded mt-1 break-all">
            {record.value}
          </code>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>DNS Configuration - {domain.domain}</DialogTitle>
          <DialogDescription>
            Generate and configure email authentication DNS records
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'generate' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Email Provider</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as 'google' | 'microsoft' | 'custom')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google Workspace / Gmail</SelectItem>
                    <SelectItem value="microsoft">Microsoft 365 / Outlook</SelectItem>
                    <SelectItem value="custom">Custom / Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>DKIM Selector</Label>
                <Input
                  value={dkimSelector}
                  onChange={(e) => setDkimSelector(e.target.value)}
                  placeholder="mail"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The selector used for DKIM signing (e.g., mail, google, s1)
                </p>
              </div>

              <div>
                <Label>DMARC Report Email</Label>
                <Input
                  value={dmarcEmail}
                  onChange={(e) => setDmarcEmail(e.target.value)}
                  placeholder={`dmarc@${domain.domain}`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Email address to receive DMARC aggregate reports
                </p>
              </div>

              <div className="space-y-3">
                <Label>Records to Configure</Label>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">SPF Record</p>
                    <p className="text-xs text-gray-500">Authorized mail servers</p>
                  </div>
                  <Switch checked={configureSpf} onCheckedChange={setConfigureSpf} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">DKIM Record</p>
                    <p className="text-xs text-gray-500">Email signature verification</p>
                  </div>
                  <Switch checked={configureDkim} onCheckedChange={setConfigureDkim} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">DMARC Record</p>
                    <p className="text-xs text-gray-500">Email authentication policy</p>
                  </div>
                  <Switch checked={configureDmarc} onCheckedChange={setConfigureDmarc} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">MX Records</p>
                    <p className="text-xs text-gray-500">Mail server routing (only for new domains)</p>
                  </div>
                  <Switch checked={configureMx} onCheckedChange={setConfigureMx} />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Records
              </Button>
            </div>
          </div>
        )}

        {step === 'results' && records && (
          <div className="space-y-6">
            <div className="space-y-3">
              {renderRecordRow('SPF Record', records.spf)}
              {renderRecordRow('DKIM Record', records.dkim)}
              {renderRecordRow('DMARC Record', records.dmarc)}
              {records.bimi && renderRecordRow('BIMI Record', records.bimi)}

              {records.mx && records.mx.length > 0 && (
                <div className="space-y-2">
                  <Label>MX Records</Label>
                  {records.mx.map((mx, i) => (
                    <div key={i} className="p-2 bg-gray-50 rounded text-sm">
                      Priority {mx.priority}: {mx.value}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Alert>
              <AlertDescription>
                <p className="font-medium">Manual Configuration</p>
                <p className="text-sm mt-1">
                  Copy these records and add them to your DNS provider, or click
                  &quot;Auto Configure&quot; to set them up automatically (requires registrar API setup).
                </p>
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('generate')}>
                Back
              </Button>
              <Button
                variant="outline"
                onClick={() => copyToClipboard(instructions)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy All
              </Button>
              <Button onClick={handleConfigure} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Auto Configure
              </Button>
            </div>
          </div>
        )}

        {step === 'configure' && configResults && (
          <div className="space-y-6">
            <div className="space-y-3">
              {configResults.map((result, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    result.success ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="font-medium">{result.record}</span>
                  </div>
                  {result.error && (
                    <span className="text-sm text-red-600">{result.error}</span>
                  )}
                </div>
              ))}
            </div>

            <Alert variant={configResults.every(r => r.success) ? 'success' : 'warning'}>
              <AlertDescription>
                {configResults.every(r => r.success)
                  ? 'All DNS records configured successfully! It may take up to 48 hours for DNS changes to propagate globally.'
                  : 'Some records failed to configure. Please check the errors above and try again or configure manually.'}
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStep('generate')
                  setConfigResults(null)
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Configure Again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
