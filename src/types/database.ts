export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          plan: 'starter' | 'pro' | 'agency'
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          plan?: 'starter' | 'pro' | 'agency'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          plan?: 'starter' | 'pro' | 'agency'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          organization_id: string | null
          email: string
          full_name: string | null
          role: 'owner' | 'admin' | 'member'
          avatar_url: string | null
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          organization_id?: string | null
          email: string
          full_name?: string | null
          role?: 'owner' | 'admin' | 'member'
          avatar_url?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          email?: string
          full_name?: string | null
          role?: 'owner' | 'admin' | 'member'
          avatar_url?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
      }
      email_accounts: {
        Row: {
          id: string
          organization_id: string | null
          email: string
          display_name: string | null
          provider: 'google' | 'microsoft' | 'smtp'
          status: 'active' | 'paused' | 'error' | 'warming'
          smtp_host: string | null
          smtp_port: number | null
          smtp_username: string | null
          smtp_password_encrypted: string | null
          imap_host: string | null
          imap_port: number | null
          oauth_tokens_encrypted: Json | null
          daily_limit: number
          sent_today: number
          warmup_enabled: boolean
          warmup_progress: number
          health_score: number
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          email: string
          display_name?: string | null
          provider: 'google' | 'microsoft' | 'smtp'
          status?: 'active' | 'paused' | 'error' | 'warming'
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          smtp_password_encrypted?: string | null
          imap_host?: string | null
          imap_port?: number | null
          oauth_tokens_encrypted?: Json | null
          daily_limit?: number
          sent_today?: number
          warmup_enabled?: boolean
          warmup_progress?: number
          health_score?: number
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          email?: string
          display_name?: string | null
          provider?: 'google' | 'microsoft' | 'smtp'
          status?: 'active' | 'paused' | 'error' | 'warming'
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          smtp_password_encrypted?: string | null
          imap_host?: string | null
          imap_port?: number | null
          oauth_tokens_encrypted?: Json | null
          daily_limit?: number
          sent_today?: number
          warmup_enabled?: boolean
          warmup_progress?: number
          health_score?: number
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      domains: {
        Row: {
          id: string
          organization_id: string | null
          domain: string
          registrar: 'cloudflare' | 'namecheap' | 'porkbun' | 'manual' | null
          registrar_domain_id: string | null
          dns_provider: string | null
          dns_zone_id: string | null
          spf_configured: boolean
          dkim_configured: boolean
          dkim_selector: string | null
          dkim_private_key_encrypted: string | null
          dmarc_configured: boolean
          bimi_configured: boolean
          health_status: 'healthy' | 'warning' | 'error' | 'pending'
          last_health_check: string | null
          auto_purchased: boolean
          purchase_price: number | null
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          domain: string
          registrar?: 'cloudflare' | 'namecheap' | 'porkbun' | 'manual' | null
          registrar_domain_id?: string | null
          dns_provider?: string | null
          dns_zone_id?: string | null
          spf_configured?: boolean
          dkim_configured?: boolean
          dkim_selector?: string | null
          dkim_private_key_encrypted?: string | null
          dmarc_configured?: boolean
          bimi_configured?: boolean
          health_status?: 'healthy' | 'warning' | 'error' | 'pending'
          last_health_check?: string | null
          auto_purchased?: boolean
          purchase_price?: number | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          domain?: string
          registrar?: 'cloudflare' | 'namecheap' | 'porkbun' | 'manual' | null
          registrar_domain_id?: string | null
          dns_provider?: string | null
          dns_zone_id?: string | null
          spf_configured?: boolean
          dkim_configured?: boolean
          dkim_selector?: string | null
          dkim_private_key_encrypted?: string | null
          dmarc_configured?: boolean
          bimi_configured?: boolean
          health_status?: 'healthy' | 'warning' | 'error' | 'pending'
          last_health_check?: string | null
          auto_purchased?: boolean
          purchase_price?: number | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      lead_lists: {
        Row: {
          id: string
          organization_id: string | null
          name: string
          description: string | null
          lead_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          name: string
          description?: string | null
          lead_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          name?: string
          description?: string | null
          lead_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      leads: {
        Row: {
          id: string
          organization_id: string | null
          list_id: string | null
          email: string
          first_name: string | null
          last_name: string | null
          company: string | null
          title: string | null
          phone: string | null
          linkedin_url: string | null
          custom_fields: Json
          status: 'active' | 'unsubscribed' | 'bounced' | 'complained'
          validation_status: 'valid' | 'invalid' | 'risky' | 'unknown' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          list_id?: string | null
          email: string
          first_name?: string | null
          last_name?: string | null
          company?: string | null
          title?: string | null
          phone?: string | null
          linkedin_url?: string | null
          custom_fields?: Json
          status?: 'active' | 'unsubscribed' | 'bounced' | 'complained'
          validation_status?: 'valid' | 'invalid' | 'risky' | 'unknown' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          list_id?: string | null
          email?: string
          first_name?: string | null
          last_name?: string | null
          company?: string | null
          title?: string | null
          phone?: string | null
          linkedin_url?: string | null
          custom_fields?: Json
          status?: 'active' | 'unsubscribed' | 'bounced' | 'complained'
          validation_status?: 'valid' | 'invalid' | 'risky' | 'unknown' | null
          created_at?: string
          updated_at?: string
        }
      }
      campaigns: {
        Row: {
          id: string
          organization_id: string | null
          name: string
          status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          settings: Json
          stats: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          name: string
          status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          settings?: Json
          stats?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          name?: string
          status?: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
          settings?: Json
          stats?: Json
          created_at?: string
          updated_at?: string
        }
      }
      campaign_sequences: {
        Row: {
          id: string
          campaign_id: string | null
          step_number: number
          subject: string
          body_html: string
          body_text: string | null
          delay_days: number
          delay_hours: number
          condition_type: 'always' | 'not_opened' | 'not_replied' | 'not_clicked'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id?: string | null
          step_number: number
          subject: string
          body_html: string
          body_text?: string | null
          delay_days?: number
          delay_hours?: number
          condition_type?: 'always' | 'not_opened' | 'not_replied' | 'not_clicked'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string | null
          step_number?: number
          subject?: string
          body_html?: string
          body_text?: string | null
          delay_days?: number
          delay_hours?: number
          condition_type?: 'always' | 'not_opened' | 'not_replied' | 'not_clicked'
          created_at?: string
          updated_at?: string
        }
      }
      campaign_leads: {
        Row: {
          id: string
          campaign_id: string | null
          lead_id: string | null
          current_step: number
          status: 'pending' | 'in_progress' | 'completed' | 'replied' | 'bounced' | 'unsubscribed'
          last_sent_at: string | null
          next_send_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id?: string | null
          lead_id?: string | null
          current_step?: number
          status?: 'pending' | 'in_progress' | 'completed' | 'replied' | 'bounced' | 'unsubscribed'
          last_sent_at?: string | null
          next_send_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string | null
          lead_id?: string | null
          current_step?: number
          status?: 'pending' | 'in_progress' | 'completed' | 'replied' | 'bounced' | 'unsubscribed'
          last_sent_at?: string | null
          next_send_at?: string | null
          created_at?: string
        }
      }
      sent_emails: {
        Row: {
          id: string
          organization_id: string | null
          campaign_id: string | null
          campaign_lead_id: string | null
          email_account_id: string | null
          lead_id: string | null
          to_email: string
          from_email: string
          subject: string
          body_html: string | null
          body_text: string | null
          message_id: string | null
          status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'complained'
          opened_at: string | null
          clicked_at: string | null
          replied_at: string | null
          bounced_at: string | null
          bounce_type: string | null
          sent_at: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          campaign_id?: string | null
          campaign_lead_id?: string | null
          email_account_id?: string | null
          lead_id?: string | null
          to_email: string
          from_email: string
          subject: string
          body_html?: string | null
          body_text?: string | null
          message_id?: string | null
          status?: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'complained'
          opened_at?: string | null
          clicked_at?: string | null
          replied_at?: string | null
          bounced_at?: string | null
          bounce_type?: string | null
          sent_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          campaign_id?: string | null
          campaign_lead_id?: string | null
          email_account_id?: string | null
          lead_id?: string | null
          to_email?: string
          from_email?: string
          subject?: string
          body_html?: string | null
          body_text?: string | null
          message_id?: string | null
          status?: 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'complained'
          opened_at?: string | null
          clicked_at?: string | null
          replied_at?: string | null
          bounced_at?: string | null
          bounce_type?: string | null
          sent_at?: string
          created_at?: string
        }
      }
      replies: {
        Row: {
          id: string
          organization_id: string | null
          sent_email_id: string | null
          email_account_id: string | null
          lead_id: string | null
          from_email: string
          to_email: string
          subject: string | null
          body_html: string | null
          body_text: string | null
          message_id: string | null
          in_reply_to: string | null
          category: 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'uncategorized'
          is_read: boolean
          received_at: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          sent_email_id?: string | null
          email_account_id?: string | null
          lead_id?: string | null
          from_email: string
          to_email: string
          subject?: string | null
          body_html?: string | null
          body_text?: string | null
          message_id?: string | null
          in_reply_to?: string | null
          category?: 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'uncategorized'
          is_read?: boolean
          received_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          sent_email_id?: string | null
          email_account_id?: string | null
          lead_id?: string | null
          from_email?: string
          to_email?: string
          subject?: string | null
          body_html?: string | null
          body_text?: string | null
          message_id?: string | null
          in_reply_to?: string | null
          category?: 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'uncategorized'
          is_read?: boolean
          received_at?: string
          created_at?: string
        }
      }
      warmup_emails: {
        Row: {
          id: string
          from_account_id: string | null
          to_account_id: string | null
          message_id: string | null
          subject: string | null
          status: 'sent' | 'delivered' | 'opened' | 'replied'
          sent_at: string
          opened_at: string | null
          replied_at: string | null
        }
        Insert: {
          id?: string
          from_account_id?: string | null
          to_account_id?: string | null
          message_id?: string | null
          subject?: string | null
          status?: 'sent' | 'delivered' | 'opened' | 'replied'
          sent_at?: string
          opened_at?: string | null
          replied_at?: string | null
        }
        Update: {
          id?: string
          from_account_id?: string | null
          to_account_id?: string | null
          message_id?: string | null
          subject?: string | null
          status?: 'sent' | 'delivered' | 'opened' | 'replied'
          sent_at?: string
          opened_at?: string | null
          replied_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
