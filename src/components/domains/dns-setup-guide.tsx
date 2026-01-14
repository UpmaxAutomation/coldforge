'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Copy,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Info,
  HelpCircle,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

interface DnsSetupGuideProps {
  open: boolean
  onClose: () => void
  domain: {
    id: string
    domain: string
    dns_provider: string | null
    spf_configured: boolean
    dkim_configured: boolean
    dmarc_configured: boolean
    health_status: 'healthy' | 'warning' | 'error' | 'pending'
  }
  onVerify: () => void
}

interface VerificationResult {
  domain: string
  healthScore: number
  healthStatus: string
  checkedAt: string
  records: {
    spf: RecordStatus
    dkim: RecordStatus
    dmarc: RecordStatus
    mx: MxStatus
    tracking: TrackingStatus
  }
  recommendations: string[]
}

interface RecordStatus {
  status: 'verified' | 'warning' | 'missing'
  configured: boolean
  valid: boolean
  record: string | null
  issues: string[]
  expected: string
}

interface MxStatus {
  status: 'verified' | 'missing'
  configured: boolean
  records: string[]
  issues: string[]
}

interface TrackingStatus {
  status: 'verified' | 'missing'
  configured: boolean
  record: string | null
  expected: string
  issues: string[]
  host: string
  value: string
}

// DNS Records to configure
const getDnsRecords = (domain: string) => ({
  spf: {
    type: 'TXT',
    name: '@',
    value: 'v=spf1 include:_spf.instantscale.com ~all',
    ttl: 3600,
    description: 'Authorizes InstantScale to send emails on behalf of your domain'
  },
  dkim: {
    type: 'CNAME',
    name: 'mail._domainkey',
    value: `mail._domainkey.${domain}.instantscale.com`,
    ttl: 3600,
    description: 'Enables email signature verification for better deliverability'
  },
  dmarc: {
    type: 'TXT',
    name: '_dmarc',
    value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
    ttl: 3600,
    description: 'Protects your domain from email spoofing'
  },
  tracking: {
    type: 'CNAME',
    name: 'track',
    value: 'tracking.instantscale.com',
    ttl: 3600,
    description: 'Enables click tracking for your email campaigns'
  }
})

// Registrar-specific instructions
const registrarInstructions: Record<string, {
  name: string
  loginUrl: string
  dnsPath: string
  steps: string[]
  tips: string[]
  videoUrl?: string
}> = {
  cloudflare: {
    name: 'Cloudflare',
    loginUrl: 'https://dash.cloudflare.com/',
    dnsPath: 'Your Domain > DNS > Records',
    steps: [
      'Log in to your Cloudflare dashboard',
      'Select your domain from the list',
      'Click on "DNS" in the left sidebar',
      'Click "+ Add record" button',
      'Select the record type (TXT or CNAME)',
      'Enter the Name and Value as shown below',
      'Click "Save"'
    ],
    tips: [
      'Make sure the proxy status is set to "DNS only" (grey cloud) for CNAME records',
      'SPF and DMARC records should be TXT type',
      'Changes typically propagate within 5 minutes'
    ]
  },
  namecheap: {
    name: 'Namecheap',
    loginUrl: 'https://www.namecheap.com/myaccount/login/',
    dnsPath: 'Domain List > Manage > Advanced DNS',
    steps: [
      'Log in to your Namecheap account',
      'Go to Domain List and click "Manage" next to your domain',
      'Click on "Advanced DNS" tab',
      'Click "ADD NEW RECORD"',
      'Select the record type from the dropdown',
      'Enter the Host and Value as shown below',
      'Click the checkmark to save'
    ],
    tips: [
      'For the @ symbol, use "@" as the Host',
      'For subdomains like "track", just enter "track" without the domain',
      'Changes may take up to 30 minutes to propagate'
    ]
  },
  godaddy: {
    name: 'GoDaddy',
    loginUrl: 'https://sso.godaddy.com/',
    dnsPath: 'My Products > Domain > DNS',
    steps: [
      'Log in to your GoDaddy account',
      'Go to "My Products"',
      'Find your domain and click "DNS"',
      'Click "Add" under the Records section',
      'Select the record type',
      'Fill in the Name and Value fields',
      'Click "Save"'
    ],
    tips: [
      'Use "@" for the root domain Name field',
      'TTL can be left at default (1 hour)',
      'DNS changes can take 24-48 hours to fully propagate'
    ]
  },
  route53: {
    name: 'AWS Route 53',
    loginUrl: 'https://console.aws.amazon.com/route53/',
    dnsPath: 'Hosted Zones > Your Domain > Create Record',
    steps: [
      'Log in to AWS Console',
      'Navigate to Route 53 service',
      'Click on "Hosted zones"',
      'Select your domain\'s hosted zone',
      'Click "Create record"',
      'Choose the record type and fill in details',
      'Click "Create records"'
    ],
    tips: [
      'Use simple routing for DNS records',
      'Leave the Record name empty for root domain records',
      'Route 53 propagates changes very quickly (usually under 60 seconds)'
    ]
  },
  google: {
    name: 'Google Domains / Squarespace',
    loginUrl: 'https://domains.google.com/',
    dnsPath: 'DNS > Custom records',
    steps: [
      'Log in to Google Domains (now Squarespace Domains)',
      'Select your domain',
      'Click on "DNS" in the left menu',
      'Scroll to "Custom records"',
      'Click "Manage custom records"',
      'Click "Create new record"',
      'Enter the details and click "Save"'
    ],
    tips: [
      'Leave Host name empty for root domain (@)',
      'Google Domains is simple and propagates quickly',
      'You can view propagation status in the interface'
    ]
  },
  porkbun: {
    name: 'Porkbun',
    loginUrl: 'https://porkbun.com/account/login',
    dnsPath: 'Domain Management > DNS Records',
    steps: [
      'Log in to your Porkbun account',
      'Click on "Domain Management"',
      'Find your domain and click the DNS icon',
      'Click "Add Record"',
      'Select type and enter values',
      'Click "Save"'
    ],
    tips: [
      'Porkbun uses a clean interface - very straightforward',
      'Leave Host field empty for root domain',
      'Records propagate within minutes'
    ]
  },
  other: {
    name: 'Other Provider',
    loginUrl: '',
    dnsPath: 'Look for "DNS Management" or "DNS Records" in your provider\'s dashboard',
    steps: [
      'Log in to your domain registrar or DNS provider',
      'Navigate to DNS settings (usually under "DNS", "DNS Management", or "Advanced DNS")',
      'Add a new record',
      'Select the record type (TXT or CNAME)',
      'Enter the name/host and value as shown below',
      'Save the record'
    ],
    tips: [
      'The Name/Host field format varies by provider - try with and without the domain suffix',
      'If you\'re unsure, contact your DNS provider\'s support',
      'DNS propagation can take 24-48 hours in some cases'
    ]
  }
}

export function DnsSetupGuide({ open, onClose, domain, onVerify }: DnsSetupGuideProps) {
  const [selectedRegistrar, setSelectedRegistrar] = useState<string>(domain.dns_provider || 'other')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null)
  const [activeTab, setActiveTab] = useState('setup')

  const dnsRecords = getDnsRecords(domain.domain)
  const instructions = registrarInstructions[selectedRegistrar] ?? registrarInstructions.other ?? {
    name: 'Unknown',
    loginUrl: '',
    dnsPath: '',
    steps: [],
    tips: [],
  }

  useEffect(() => {
    if (open) {
      // Auto-verify on open
      handleVerify()
    }
  }, [open])

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const response = await fetch(`/api/domains/${domain.id}/verify`, {
        method: 'POST',
      })
      if (response.ok) {
        const data = await response.json()
        setVerificationResult(data)
        onVerify()
      } else {
        toast.error('Verification failed')
      }
    } catch {
      toast.error('Failed to verify DNS')
    } finally {
      setVerifying(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      default:
        return <XCircle className="h-5 w-5 text-red-500" />
    }
  }

  const getProgressValue = () => {
    if (!verificationResult) return 0
    return verificationResult.healthScore
  }

  const renderDnsRecord = (key: string, record: typeof dnsRecords.spf, status?: RecordStatus | TrackingStatus) => {
    const isConfigured = status?.configured ?? false
    const recordStatus = status?.status ?? 'missing'

    return (
      <Card key={key} className={isConfigured ? 'border-green-200 bg-green-50/50' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(recordStatus)}
              <CardTitle className="text-base">{key.toUpperCase()} Record</CardTitle>
              <Badge variant={isConfigured ? 'default' : 'secondary'}>
                {isConfigured ? 'Configured' : 'Not Found'}
              </Badge>
            </div>
            <Badge variant="outline">{record.type}</Badge>
          </div>
          <CardDescription>{record.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Name / Host</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(record.name, `${key}-name`)}
                className="h-8"
              >
                {copiedField === `${key}-name` ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <code className="bg-muted px-3 py-2 rounded text-sm font-mono block">
              {record.name}
            </code>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Value / Content</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(record.value, `${key}-value`)}
                className="h-8"
              >
                {copiedField === `${key}-value` ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <code className="bg-muted px-3 py-2 rounded text-sm font-mono block break-all">
              {record.value}
            </code>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>TTL: {record.ttl} seconds (1 hour)</span>
          </div>

          {status?.issues && status.issues.length > 0 && (
            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Issues Found</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 mt-1 space-y-1">
                  {status.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>DNS Setup Guide for</span>
            <Badge variant="outline" className="text-base">{domain.domain}</Badge>
          </DialogTitle>
          <DialogDescription>
            Follow these steps to configure your domain for optimal email deliverability
          </DialogDescription>
        </DialogHeader>

        {/* Health Score Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Domain Health Score</span>
            <span className="text-sm font-bold">{verificationResult?.healthScore ?? 0}%</span>
          </div>
          <Progress value={getProgressValue()} className="h-3" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">DNS Records</TabsTrigger>
            <TabsTrigger value="instructions">Setup Guide</TabsTrigger>
            <TabsTrigger value="status">Verification</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-4 mt-4">
            {/* Registrar Selection */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Your DNS Provider:</span>
              <Select value={selectedRegistrar} onValueChange={setSelectedRegistrar}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloudflare">Cloudflare</SelectItem>
                  <SelectItem value="namecheap">Namecheap</SelectItem>
                  <SelectItem value="godaddy">GoDaddy</SelectItem>
                  <SelectItem value="route53">AWS Route 53</SelectItem>
                  <SelectItem value="google">Google Domains</SelectItem>
                  <SelectItem value="porkbun">Porkbun</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {instructions.loginUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={instructions.loginUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open {instructions.name}
                  </a>
                </Button>
              )}
            </div>

            {/* DNS Records */}
            <div className="grid gap-4">
              {renderDnsRecord('spf', dnsRecords.spf, verificationResult?.records.spf)}
              {renderDnsRecord('dkim', dnsRecords.dkim, verificationResult?.records.dkim)}
              {renderDnsRecord('dmarc', dnsRecords.dmarc, verificationResult?.records.dmarc)}
              {renderDnsRecord('tracking', dnsRecords.tracking, verificationResult?.records.tracking)}
            </div>

            <Button onClick={handleVerify} disabled={verifying} className="w-full">
              {verifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying DNS Records...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Verify DNS Configuration
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="instructions" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  {instructions.name} Setup Instructions
                </CardTitle>
                <CardDescription>
                  Navigate to: <code className="bg-muted px-2 py-1 rounded">{instructions.dnsPath}</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Step by step */}
                <div className="space-y-3">
                  <h4 className="font-semibold">Steps:</h4>
                  <ol className="list-decimal pl-6 space-y-2">
                    {instructions.steps.map((step, i) => (
                      <li key={i} className="text-muted-foreground">{step}</li>
                    ))}
                  </ol>
                </div>

                {/* Tips */}
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />
                    Tips:
                  </h4>
                  <ul className="list-disc pl-6 space-y-2">
                    {instructions.tips.map((tip, i) => (
                      <li key={i} className="text-muted-foreground text-sm">{tip}</li>
                    ))}
                  </ul>
                </div>

                {/* Quick Reference Table */}
                <div className="space-y-3">
                  <h4 className="font-semibold">Quick Reference:</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left">Record</th>
                          <th className="px-4 py-2 text-left">Type</th>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(dnsRecords).map(([key, record]) => (
                          <tr key={key} className="border-t">
                            <td className="px-4 py-2 font-medium">{key.toUpperCase()}</td>
                            <td className="px-4 py-2">{record.type}</td>
                            <td className="px-4 py-2 font-mono text-xs">{record.name}</td>
                            <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]" title={record.value}>
                              {record.value.length > 30 ? record.value.substring(0, 30) + '...' : record.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>DNS Propagation</AlertTitle>
              <AlertDescription>
                After adding DNS records, it can take anywhere from a few minutes to 48 hours for changes to propagate globally.
                Most changes are visible within 15-30 minutes.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="status" className="space-y-4 mt-4">
            {verificationResult ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Overall Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3">
                        {verificationResult.healthStatus === 'healthy' ? (
                          <CheckCircle className="h-8 w-8 text-green-500" />
                        ) : verificationResult.healthStatus === 'warning' ? (
                          <AlertTriangle className="h-8 w-8 text-yellow-500" />
                        ) : (
                          <XCircle className="h-8 w-8 text-red-500" />
                        )}
                        <div>
                          <p className="font-semibold capitalize">{verificationResult.healthStatus}</p>
                          <p className="text-sm text-muted-foreground">
                            Health Score: {verificationResult.healthScore}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Records Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(['spf', 'dkim', 'dmarc', 'tracking'] as const).map(key => {
                          const record = verificationResult.records[key]
                          return (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-sm">{key.toUpperCase()}</span>
                              <Badge variant={record.configured ? 'default' : 'secondary'}>
                                {record.status}
                              </Badge>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {verificationResult.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {verificationResult.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Info className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <p className="text-sm text-muted-foreground text-center">
                  Last verified: {new Date(verificationResult.checkedAt).toLocaleString()}
                </p>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No verification results yet</p>
                <Button onClick={handleVerify} disabled={verifying}>
                  {verifying ? 'Verifying...' : 'Run Verification'}
                </Button>
              </div>
            )}

            <Button onClick={handleVerify} disabled={verifying} variant="outline" className="w-full">
              {verifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-verify DNS
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
