import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Mail, Zap, Shield, BarChart3, Globe, Users } from 'lucide-react'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">InstantScale</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Scale Your Cold Email
            <span className="text-primary"> Outreach</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            The all-in-one platform for cold email at scale. Automate domain setup,
            warm up accounts, and send personalized campaigns to thousands of prospects.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="h-12 px-8">
                Start Free Trial
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-12 px-8">
                View Demo
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Grid */}
        <section className="border-t bg-muted/50 py-24">
          <div className="container mx-auto px-4">
            <h2 className="text-center text-3xl font-bold">Everything You Need</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
              From domain purchase to inbox delivery, we handle the entire cold email infrastructure.
            </p>
            <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={Globe}
                title="Domain Automation"
                description="Auto-purchase domains from Cloudflare, Namecheap, or Porkbun. DNS records configured automatically."
              />
              <FeatureCard
                icon={Shield}
                title="Deliverability"
                description="SPF, DKIM, DMARC, and BIMI setup. Monitor domain health and reputation in real-time."
              />
              <FeatureCard
                icon={Zap}
                title="Smart Warmup"
                description="Hybrid warmup system using both internal pool and external providers like Instantly or WarmupInbox."
              />
              <FeatureCard
                icon={Mail}
                title="Campaign Engine"
                description="Multi-step sequences with A/B testing, personalization, and smart scheduling across timezones."
              />
              <FeatureCard
                icon={BarChart3}
                title="Analytics"
                description="Track opens, clicks, replies, and bounces. Optimize campaigns with data-driven insights."
              />
              <FeatureCard
                icon={Users}
                title="Multi-Tenant"
                description="Built for agencies. Manage multiple clients with isolated data and white-label options."
              />
            </div>
          </div>
        </section>

        {/* Pricing Preview */}
        <section className="py-24">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-muted-foreground">
              Start free, scale as you grow. No hidden fees.
            </p>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <PricingCard
                name="Starter"
                price="Free"
                features={['1 email account', '1,000 emails/month', 'Basic warmup', 'Email support']}
              />
              <PricingCard
                name="Pro"
                price="$99"
                features={['25 email accounts', '50,000 emails/month', 'Advanced warmup', 'Priority support']}
                highlighted
              />
              <PricingCard
                name="Agency"
                price="$299"
                features={['Unlimited accounts', '500,000 emails/month', 'White-label', 'Dedicated support']}
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} InstantScale. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <Icon className="h-10 w-10 text-primary" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function PricingCard({ name, price, features, highlighted }: {
  name: string
  price: string
  features: string[]
  highlighted?: boolean
}) {
  return (
    <div className={`rounded-lg border p-6 ${highlighted ? 'border-primary bg-primary/5' : ''}`}>
      <h3 className="text-lg font-semibold">{name}</h3>
      <p className="mt-2 text-3xl font-bold">
        {price}
        {price !== 'Free' && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
      </p>
      <ul className="mt-6 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center text-sm">
            <svg className="mr-2 h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>
      <Link href="/register" className="mt-6 block">
        <Button className="w-full" variant={highlighted ? 'default' : 'outline'}>
          Get Started
        </Button>
      </Link>
    </div>
  )
}
