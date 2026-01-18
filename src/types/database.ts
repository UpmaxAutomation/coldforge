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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
          dkim_public_key: string | null
          dkim_private_key_encrypted: string | null
          dmarc_configured: boolean
          bimi_configured: boolean
          health_status: 'healthy' | 'warning' | 'error' | 'pending'
          health_score: number | null
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
          dkim_public_key?: string | null
          dkim_private_key_encrypted?: string | null
          dmarc_configured?: boolean
          bimi_configured?: boolean
          health_status?: 'healthy' | 'warning' | 'error' | 'pending'
          health_score?: number | null
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
          dkim_public_key?: string | null
          dkim_private_key_encrypted?: string | null
          dmarc_configured?: boolean
          bimi_configured?: boolean
          health_status?: 'healthy' | 'warning' | 'error' | 'pending'
          health_score?: number | null
          last_health_check?: string | null
          auto_purchased?: boolean
          purchase_price?: number | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      replies: {
        Row: {
          id: string
          organization_id: string | null
          sent_email_id: string | null
          email_account_id: string | null
          mailbox_id: string | null
          lead_id: string | null
          campaign_id: string | null
          thread_id: string | null
          from_email: string
          from_name: string | null
          to_email: string
          subject: string | null
          body_html: string | null
          body_text: string | null
          message_id: string | null
          in_reply_to: string | null
          category: 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'uncategorized'
          sentiment: 'positive' | 'neutral' | 'negative' | null
          confidence: number | null
          status: 'received' | 'unread' | 'read' | 'replied' | 'archived' | 'snoozed'
          is_read: boolean
          is_auto_detected: boolean
          snoozed_until: string | null
          received_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          sent_email_id?: string | null
          email_account_id?: string | null
          mailbox_id?: string | null
          lead_id?: string | null
          campaign_id?: string | null
          thread_id?: string | null
          from_email: string
          from_name?: string | null
          to_email: string
          subject?: string | null
          body_html?: string | null
          body_text?: string | null
          message_id?: string | null
          in_reply_to?: string | null
          category?: 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'uncategorized'
          sentiment?: 'positive' | 'neutral' | 'negative' | null
          confidence?: number | null
          status?: 'received' | 'unread' | 'read' | 'replied' | 'archived' | 'snoozed'
          is_read?: boolean
          is_auto_detected?: boolean
          snoozed_until?: string | null
          received_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          sent_email_id?: string | null
          email_account_id?: string | null
          mailbox_id?: string | null
          lead_id?: string | null
          campaign_id?: string | null
          thread_id?: string | null
          from_email?: string
          from_name?: string | null
          to_email?: string
          subject?: string | null
          body_html?: string | null
          body_text?: string | null
          message_id?: string | null
          in_reply_to?: string | null
          category?: 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'uncategorized'
          sentiment?: 'positive' | 'neutral' | 'negative' | null
          confidence?: number | null
          status?: 'received' | 'unread' | 'read' | 'replied' | 'archived' | 'snoozed'
          is_read?: boolean
          is_auto_detected?: boolean
          snoozed_until?: string | null
          received_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      sync_states: {
        Row: {
          id: string
          account_id: string
          last_sync_at: string | null
          last_history_id: string | null
          last_delta_link: string | null
          last_uid: number | null
          sync_cursor: string | null
          status: 'idle' | 'syncing' | 'completed' | 'error'
          error_message: string | null
          error_count: number
          messages_total: number
          messages_synced: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_id: string
          last_sync_at?: string | null
          last_history_id?: string | null
          last_delta_link?: string | null
          last_uid?: number | null
          sync_cursor?: string | null
          status?: 'idle' | 'syncing' | 'completed' | 'error'
          error_message?: string | null
          error_count?: number
          messages_total?: number
          messages_synced?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          last_sync_at?: string | null
          last_history_id?: string | null
          last_delta_link?: string | null
          last_uid?: number | null
          sync_cursor?: string | null
          status?: 'idle' | 'syncing' | 'completed' | 'error'
          error_message?: string | null
          error_count?: number
          messages_total?: number
          messages_synced?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_messages: {
        Row: {
          id: string
          external_id: string
          account_id: string
          organization_id: string
          thread_id: string
          message_id: string
          in_reply_to: string | null
          references: string[]
          from_email: string
          from_name: string | null
          to_emails: string[]
          cc_emails: string[]
          subject: string
          body_text: string
          body_html: string | null
          snippet: string
          is_read: boolean
          direction: 'inbound' | 'outbound'
          category: string
          sentiment: string
          category_confidence: number
          has_attachments: boolean
          provider: 'google' | 'microsoft' | 'smtp'
          received_at: string
          internal_date: string
          raw_data: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          external_id: string
          account_id: string
          organization_id: string
          thread_id: string
          message_id: string
          in_reply_to?: string | null
          references?: string[]
          from_email: string
          from_name?: string | null
          to_emails?: string[]
          cc_emails?: string[]
          subject: string
          body_text: string
          body_html?: string | null
          snippet?: string
          is_read?: boolean
          direction: 'inbound' | 'outbound'
          category?: string
          sentiment?: string
          category_confidence?: number
          has_attachments?: boolean
          provider: 'google' | 'microsoft' | 'smtp'
          received_at: string
          internal_date: string
          raw_data?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          external_id?: string
          account_id?: string
          organization_id?: string
          thread_id?: string
          message_id?: string
          in_reply_to?: string | null
          references?: string[]
          from_email?: string
          from_name?: string | null
          to_emails?: string[]
          cc_emails?: string[]
          subject?: string
          body_text?: string
          body_html?: string | null
          snippet?: string
          is_read?: boolean
          direction?: 'inbound' | 'outbound'
          category?: string
          sentiment?: string
          category_confidence?: number
          has_attachments?: boolean
          provider?: 'google' | 'microsoft' | 'smtp'
          received_at?: string
          internal_date?: string
          raw_data?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          id: string
          organization_id: string
          mailbox_id: string
          campaign_id: string | null
          lead_id: string | null
          thread_external_id: string | null
          subject: string
          participant_email: string
          participant_name: string | null
          message_count: number
          last_message_at: string
          first_message_at: string
          status: 'active' | 'resolved' | 'archived' | 'spam'
          is_read: boolean
          category: 'interested' | 'not_interested' | 'maybe' | 'out_of_office' | 'auto_reply' | 'bounced' | 'meeting_request' | 'uncategorized' | null
          sentiment: 'positive' | 'neutral' | 'negative' | null
          assigned_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          mailbox_id: string
          campaign_id?: string | null
          lead_id?: string | null
          thread_external_id?: string | null
          subject: string
          participant_email: string
          participant_name?: string | null
          message_count?: number
          last_message_at?: string
          first_message_at?: string
          status?: 'active' | 'resolved' | 'archived' | 'spam'
          is_read?: boolean
          category?: 'interested' | 'not_interested' | 'maybe' | 'out_of_office' | 'auto_reply' | 'bounced' | 'meeting_request' | 'uncategorized' | null
          sentiment?: 'positive' | 'neutral' | 'negative' | null
          assigned_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          mailbox_id?: string
          campaign_id?: string | null
          lead_id?: string | null
          thread_external_id?: string | null
          subject?: string
          participant_email?: string
          participant_name?: string | null
          message_count?: number
          last_message_at?: string
          first_message_at?: string
          status?: 'active' | 'resolved' | 'archived' | 'spam'
          is_read?: boolean
          category?: 'interested' | 'not_interested' | 'maybe' | 'out_of_office' | 'auto_reply' | 'bounced' | 'meeting_request' | 'uncategorized' | null
          sentiment?: 'positive' | 'neutral' | 'negative' | null
          assigned_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      thread_messages: {
        Row: {
          id: string
          thread_id: string
          message_id: string | null
          in_reply_to: string | null
          direction: 'inbound' | 'outbound'
          from_email: string
          from_name: string | null
          to_email: string
          subject: string | null
          body_text: string | null
          body_html: string | null
          snippet: string | null
          has_attachments: boolean
          sent_at: string
          received_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          message_id?: string | null
          in_reply_to?: string | null
          direction?: 'inbound' | 'outbound'
          from_email: string
          from_name?: string | null
          to_email: string
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          snippet?: string | null
          has_attachments?: boolean
          sent_at?: string
          received_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          message_id?: string | null
          in_reply_to?: string | null
          direction?: 'inbound' | 'outbound'
          from_email?: string
          from_name?: string | null
          to_email?: string
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          snippet?: string | null
          has_attachments?: boolean
          sent_at?: string
          received_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          organization_id: string | null
          email: string
          full_name: string | null
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
          avatar_url?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          id: string
          workspace_id: string | null
          organization_id: string | null
          email_queue_id: string | null
          campaign_id: string | null
          lead_id: string | null
          mailbox_id: string | null
          message_id: string | null
          tracking_id: string | null
          event_type: 'sent' | 'delivered' | 'bounced' | 'soft_bounced' | 'opened' | 'clicked' | 'complained' | 'unsubscribed' | 'deferred'
          recipient_email: string
          event_data: Json | null
          clicked_url: string | null
          bounce_type: string | null
          bounce_subtype: string | null
          user_agent: string | null
          ip_address: string | null
          geo_country: string | null
          geo_city: string | null
          device_type: string | null
          occurred_at: string
          timestamp: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          organization_id?: string | null
          email_queue_id?: string | null
          campaign_id?: string | null
          lead_id?: string | null
          mailbox_id?: string | null
          message_id?: string | null
          tracking_id?: string | null
          event_type: 'sent' | 'delivered' | 'bounced' | 'soft_bounced' | 'opened' | 'clicked' | 'complained' | 'unsubscribed' | 'deferred'
          recipient_email: string
          event_data?: Json | null
          clicked_url?: string | null
          bounce_type?: string | null
          bounce_subtype?: string | null
          user_agent?: string | null
          ip_address?: string | null
          geo_country?: string | null
          geo_city?: string | null
          device_type?: string | null
          occurred_at?: string
          timestamp?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          organization_id?: string | null
          email_queue_id?: string | null
          campaign_id?: string | null
          lead_id?: string | null
          mailbox_id?: string | null
          message_id?: string | null
          tracking_id?: string | null
          event_type?: 'sent' | 'delivered' | 'bounced' | 'soft_bounced' | 'opened' | 'clicked' | 'complained' | 'unsubscribed' | 'deferred'
          recipient_email?: string
          event_data?: Json | null
          clicked_url?: string | null
          bounce_type?: string | null
          bounce_subtype?: string | null
          user_agent?: string | null
          ip_address?: string | null
          geo_country?: string | null
          geo_city?: string | null
          device_type?: string | null
          occurred_at?: string
          timestamp?: string | null
          created_at?: string
        }
        Relationships: []
      }
      email_jobs: {
        Row: {
          id: string
          organization_id: string
          campaign_id: string
          lead_id: string
          mailbox_id: string
          sequence_step_id: string | null
          variant_id: string | null
          status: 'pending' | 'scheduled' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'cancelled'
          priority: number
          scheduled_at: string
          attempts: number
          max_attempts: number
          last_attempt_at: string | null
          message_id: string | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          campaign_id: string
          lead_id: string
          mailbox_id: string
          sequence_step_id?: string | null
          variant_id?: string | null
          status?: 'pending' | 'scheduled' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'cancelled'
          priority?: number
          scheduled_at?: string
          attempts?: number
          max_attempts?: number
          last_attempt_at?: string | null
          message_id?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          campaign_id?: string
          lead_id?: string
          mailbox_id?: string
          sequence_step_id?: string | null
          variant_id?: string | null
          status?: 'pending' | 'scheduled' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'cancelled'
          priority?: number
          scheduled_at?: string
          attempts?: number
          max_attempts?: number
          last_attempt_at?: string | null
          message_id?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      mailboxes: {
        Row: {
          id: string
          organization_id: string | null
          domain_id: string | null
          email: string
          first_name: string | null
          last_name: string | null
          provider: 'google_workspace' | 'microsoft_365' | 'smtp' | 'other'
          status: 'pending' | 'active' | 'paused' | 'error' | 'suspended'
          smtp_host: string | null
          smtp_port: number | null
          smtp_username: string | null
          smtp_password_encrypted: string | null
          imap_host: string | null
          imap_port: number | null
          sending_quota: number
          emails_sent_today: number
          warmup_enabled: boolean
          warmup_stage: number
          health_score: number | null
          reputation_score: number | null
          last_error: string | null
          spam_complaints: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id?: string | null
          domain_id?: string | null
          email: string
          first_name?: string | null
          last_name?: string | null
          provider?: 'google_workspace' | 'microsoft_365' | 'smtp' | 'other'
          status?: 'pending' | 'active' | 'paused' | 'error' | 'suspended'
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          smtp_password_encrypted?: string | null
          imap_host?: string | null
          imap_port?: number | null
          sending_quota?: number
          emails_sent_today?: number
          warmup_enabled?: boolean
          warmup_stage?: number
          health_score?: number | null
          reputation_score?: number | null
          last_error?: string | null
          spam_complaints?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string | null
          domain_id?: string | null
          email?: string
          first_name?: string | null
          last_name?: string | null
          provider?: 'google_workspace' | 'microsoft_365' | 'smtp' | 'other'
          status?: 'pending' | 'active' | 'paused' | 'error' | 'suspended'
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          smtp_password_encrypted?: string | null
          imap_host?: string | null
          imap_port?: number | null
          sending_quota?: number
          emails_sent_today?: number
          warmup_enabled?: boolean
          warmup_stage?: number
          health_score?: number | null
          reputation_score?: number | null
          last_error?: string | null
          spam_complaints?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_queue: {
        Row: {
          id: string
          workspace_id: string | null
          campaign_id: string | null
          sequence_id: string | null
          sequence_step: number | null
          from_mailbox_id: string | null
          from_email: string
          from_name: string | null
          reply_to: string | null
          to_email: string
          to_name: string | null
          lead_id: string | null
          subject: string
          body_html: string
          body_text: string | null
          custom_headers: Json
          tracking_id: string | null
          attachments: Json
          smtp_provider_id: string | null
          assigned_ip: string | null
          scheduled_at: string
          send_window_start: string | null
          send_window_end: string | null
          timezone: string
          status: 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'cancelled'
          priority: number
          attempts: number
          max_attempts: number
          message_id: string | null
          sent_at: string | null
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          campaign_id?: string | null
          sequence_id?: string | null
          sequence_step?: number | null
          from_mailbox_id?: string | null
          from_email: string
          from_name?: string | null
          reply_to?: string | null
          to_email: string
          to_name?: string | null
          lead_id?: string | null
          subject: string
          body_html: string
          body_text?: string | null
          custom_headers?: Json
          tracking_id?: string | null
          attachments?: Json
          smtp_provider_id?: string | null
          assigned_ip?: string | null
          scheduled_at?: string
          send_window_start?: string | null
          send_window_end?: string | null
          timezone?: string
          status?: 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'cancelled'
          priority?: number
          attempts?: number
          max_attempts?: number
          message_id?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          campaign_id?: string | null
          sequence_id?: string | null
          sequence_step?: number | null
          from_mailbox_id?: string | null
          from_email?: string
          from_name?: string | null
          reply_to?: string | null
          to_email?: string
          to_name?: string | null
          lead_id?: string | null
          subject?: string
          body_html?: string
          body_text?: string | null
          custom_headers?: Json
          tracking_id?: string | null
          attachments?: Json
          smtp_provider_id?: string | null
          assigned_ip?: string | null
          scheduled_at?: string
          send_window_start?: string | null
          send_window_end?: string | null
          timezone?: string
          status?: 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'cancelled'
          priority?: number
          attempts?: number
          max_attempts?: number
          message_id?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          id: string
          workspace_id: string | null
          email: string
          reason: 'hard_bounce' | 'soft_bounce' | 'complaint' | 'unsubscribe' | 'manual'
          source: 'webhook' | 'manual' | 'import' | 'api'
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          email: string
          reason: 'hard_bounce' | 'soft_bounce' | 'complaint' | 'unsubscribe' | 'manual'
          source?: 'webhook' | 'manual' | 'import' | 'api'
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          email?: string
          reason?: 'hard_bounce' | 'soft_bounce' | 'complaint' | 'unsubscribe' | 'manual'
          source?: 'webhook' | 'manual' | 'import' | 'api'
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          id: string
          workspace_id: string
          provider: string
          state: string
          code_verifier: string | null
          redirect_uri: string
          scopes: string[]
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          provider: string
          state: string
          code_verifier?: string | null
          redirect_uri: string
          scopes?: string[]
          expires_at: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          provider?: string
          state?: string
          code_verifier?: string | null
          redirect_uri?: string
          scopes?: string[]
          expires_at?: string
          used_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          id: string
          workspace_id: string
          provider: 'hubspot' | 'salesforce' | 'pipedrive' | 'zoho' | 'close' | 'slack' | 'discord' | 'teams' | 'zapier' | 'make' | 'n8n' | 'google_sheets' | 'airtable' | 'webhook' | 'api'
          type: 'crm' | 'email' | 'webhook' | 'spreadsheet' | 'communication' | 'automation' | 'analytics' | 'notification'
          name: string
          status: 'connected' | 'disconnected' | 'error' | 'pending'
          config: Json
          encrypted_credentials: string | null
          sync_settings: Json | null
          last_sync_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          provider: 'hubspot' | 'salesforce' | 'pipedrive' | 'zoho' | 'close' | 'slack' | 'discord' | 'teams' | 'zapier' | 'make' | 'n8n' | 'google_sheets' | 'airtable' | 'webhook' | 'api'
          type: 'crm' | 'email' | 'webhook' | 'spreadsheet' | 'communication' | 'automation' | 'analytics' | 'notification'
          name: string
          status?: 'connected' | 'disconnected' | 'error' | 'pending'
          config?: Json
          encrypted_credentials?: string | null
          sync_settings?: Json | null
          last_sync_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          provider?: 'hubspot' | 'salesforce' | 'pipedrive' | 'zoho' | 'close' | 'slack' | 'discord' | 'teams' | 'zapier' | 'make' | 'n8n' | 'google_sheets' | 'airtable' | 'webhook' | 'api'
          type?: 'crm' | 'email' | 'webhook' | 'spreadsheet' | 'communication' | 'automation' | 'analytics' | 'notification'
          name?: string
          status?: 'connected' | 'disconnected' | 'error' | 'pending'
          config?: Json
          encrypted_credentials?: string | null
          sync_settings?: Json | null
          last_sync_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ab_tests: {
        Row: {
          id: string
          workspace_id: string
          campaign_id: string
          name: string
          description: string | null
          status: 'draft' | 'running' | 'paused' | 'completed' | 'archived'
          test_type: 'subject' | 'body' | 'sender' | 'timing'
          winning_metric: 'opens' | 'clicks' | 'replies'
          confidence_level: number
          auto_select_winner: boolean
          minimum_sample_size: number
          winning_variant_id: string | null
          winner_determined_at: string | null
          started_at: string | null
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          campaign_id: string
          name: string
          description?: string | null
          status?: 'draft' | 'running' | 'paused' | 'completed' | 'archived'
          test_type: 'subject' | 'body' | 'sender' | 'timing'
          winning_metric?: 'opens' | 'clicks' | 'replies'
          confidence_level?: number
          auto_select_winner?: boolean
          minimum_sample_size?: number
          winning_variant_id?: string | null
          winner_determined_at?: string | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          campaign_id?: string
          name?: string
          description?: string | null
          status?: 'draft' | 'running' | 'paused' | 'completed' | 'archived'
          test_type?: 'subject' | 'body' | 'sender' | 'timing'
          winning_metric?: 'opens' | 'clicks' | 'replies'
          confidence_level?: number
          auto_select_winner?: boolean
          minimum_sample_size?: number
          winning_variant_id?: string | null
          winner_determined_at?: string | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ab_test_variants: {
        Row: {
          id: string
          test_id: string
          name: string
          type: 'subject' | 'body' | 'sender' | 'timing'
          content: Json
          weight: number
          sent: number
          delivered: number
          opened: number
          clicked: number
          replied: number
          bounced: number
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          name: string
          type: 'subject' | 'body' | 'sender' | 'timing'
          content?: Json
          weight?: number
          sent?: number
          delivered?: number
          opened?: number
          clicked?: number
          replied?: number
          bounced?: number
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          name?: string
          type?: 'subject' | 'body' | 'sender' | 'timing'
          content?: Json
          weight?: number
          sent?: number
          delivered?: number
          opened?: number
          clicked?: number
          replied?: number
          bounced?: number
          created_at?: string
        }
        Relationships: []
      }
      scheduled_reports: {
        Row: {
          id: string
          workspace_id: string
          name: string
          description: string | null
          report_type: 'campaign_performance' | 'email_deliverability' | 'lead_engagement' | 'mailbox_health' | 'ab_test_results' | 'team_activity' | 'workspace_overview'
          config: Json
          schedule_enabled: boolean
          schedule_frequency: 'daily' | 'weekly' | 'monthly' | null
          recipients: string[]
          export_format: 'csv' | 'xlsx' | 'json' | 'pdf'
          last_run_at: string | null
          next_run_at: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          description?: string | null
          report_type: 'campaign_performance' | 'email_deliverability' | 'lead_engagement' | 'mailbox_health' | 'ab_test_results' | 'team_activity' | 'workspace_overview'
          config?: Json
          schedule_enabled?: boolean
          schedule_frequency?: 'daily' | 'weekly' | 'monthly' | null
          recipients?: string[]
          export_format?: 'csv' | 'xlsx' | 'json' | 'pdf'
          last_run_at?: string | null
          next_run_at?: string | null
          created_at?: string
          created_by: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          description?: string | null
          report_type?: 'campaign_performance' | 'email_deliverability' | 'lead_engagement' | 'mailbox_health' | 'ab_test_results' | 'team_activity' | 'workspace_overview'
          config?: Json
          schedule_enabled?: boolean
          schedule_frequency?: 'daily' | 'weekly' | 'monthly' | null
          recipients?: string[]
          export_format?: 'csv' | 'xlsx' | 'json' | 'pdf'
          last_run_at?: string | null
          next_run_at?: string | null
          created_at?: string
          created_by?: string
        }
        Relationships: []
      }
      report_exports: {
        Row: {
          id: string
          workspace_id: string
          name: string
          report_type: 'campaign_performance' | 'email_deliverability' | 'lead_engagement' | 'mailbox_health' | 'ab_test_results' | 'team_activity' | 'workspace_overview'
          format: 'csv' | 'xlsx' | 'json' | 'pdf'
          status: 'pending' | 'processing' | 'completed' | 'failed'
          config: Json
          file_url: string | null
          file_size: number | null
          record_count: number | null
          error_message: string | null
          expires_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          report_type: 'campaign_performance' | 'email_deliverability' | 'lead_engagement' | 'mailbox_health' | 'ab_test_results' | 'team_activity' | 'workspace_overview'
          format: 'csv' | 'xlsx' | 'json' | 'pdf'
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          config?: Json
          file_url?: string | null
          file_size?: number | null
          record_count?: number | null
          error_message?: string | null
          expires_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          report_type?: 'campaign_performance' | 'email_deliverability' | 'lead_engagement' | 'mailbox_health' | 'ab_test_results' | 'team_activity' | 'workspace_overview'
          format?: 'csv' | 'xlsx' | 'json' | 'pdf'
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          config?: Json
          file_url?: string | null
          file_size?: number | null
          record_count?: number | null
          error_message?: string | null
          expires_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          owner_id: string
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          owner_id: string
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          owner_id?: string
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member' | 'viewer'
          invited_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member' | 'viewer'
          invited_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member' | 'viewer'
          invited_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      // Billing-related tables
      subscription_plans: {
        Row: {
          id: string
          name: string
          tier: 'free' | 'starter' | 'growth' | 'business' | 'enterprise'
          description: string | null
          price_cents: number
          billing_interval: 'month' | 'year'
          stripe_price_id: string | null
          stripe_product_id: string | null
          limits: Json
          features: Json
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          tier: 'free' | 'starter' | 'growth' | 'business' | 'enterprise'
          description?: string | null
          price_cents?: number
          billing_interval?: 'month' | 'year'
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          limits?: Json
          features?: Json
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          tier?: 'free' | 'starter' | 'growth' | 'business' | 'enterprise'
          description?: string | null
          price_cents?: number
          billing_interval?: 'month' | 'year'
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          limits?: Json
          features?: Json
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_subscriptions: {
        Row: {
          id: string
          workspace_id: string
          plan_id: string
          stripe_subscription_id: string | null
          status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused' | 'unpaid'
          current_period_start: string
          current_period_end: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          trial_start: string | null
          trial_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          plan_id: string
          stripe_subscription_id?: string | null
          status?: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused' | 'unpaid'
          current_period_start?: string
          current_period_end?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          plan_id?: string
          stripe_subscription_id?: string | null
          status?: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused' | 'unpaid'
          current_period_start?: string
          current_period_end?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          workspace_id: string | null
          organization_id: string | null
          plan_id: string
          stripe_subscription_id: string | null
          status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused' | 'unpaid'
          current_period_start: string
          current_period_end: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          trial_start: string | null
          trial_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          organization_id?: string | null
          plan_id: string
          stripe_subscription_id?: string | null
          status?: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused' | 'unpaid'
          current_period_start?: string
          current_period_end?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          organization_id?: string | null
          plan_id?: string
          stripe_subscription_id?: string | null
          status?: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused' | 'unpaid'
          current_period_start?: string
          current_period_end?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_customers: {
        Row: {
          id: string
          workspace_id: string
          stripe_customer_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          stripe_customer_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          stripe_customer_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credits: {
        Row: {
          id: string
          workspace_id: string
          balance: number
          lifetime_purchased: number
          lifetime_used: number
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          balance?: number
          lifetime_purchased?: number
          lifetime_used?: number
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          balance?: number
          lifetime_purchased?: number
          lifetime_used?: number
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          id: string
          workspace_id: string
          type: 'purchase' | 'usage' | 'refund' | 'adjustment' | 'expiry' | 'bonus'
          amount: number
          balance_after: number
          description: string
          reference_type: string | null
          reference_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          type: 'purchase' | 'usage' | 'refund' | 'adjustment' | 'expiry' | 'bonus'
          amount: number
          balance_after: number
          description: string
          reference_type?: string | null
          reference_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          type?: 'purchase' | 'usage' | 'refund' | 'adjustment' | 'expiry' | 'bonus'
          amount?: number
          balance_after?: number
          description?: string
          reference_type?: string | null
          reference_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      credit_packages: {
        Row: {
          id: string
          name: string
          credits: number
          price_cents: number
          currency: string
          bonus_credits: number
          stripe_price_id: string | null
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          credits: number
          price_cents: number
          currency?: string
          bonus_credits?: number
          stripe_price_id?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          credits?: number
          price_cents?: number
          currency?: string
          bonus_credits?: number
          stripe_price_id?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          id: string
          workspace_id: string
          event_type: string
          data: Json
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          event_type: string
          data?: Json
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          event_type?: string
          data?: Json
          created_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          id: string
          workspace_id: string
          stripe_payment_method_id: string
          type: string
          last_four: string | null
          brand: string | null
          exp_month: number | null
          exp_year: number | null
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          stripe_payment_method_id: string
          type: string
          last_four?: string | null
          brand?: string | null
          exp_month?: number | null
          exp_year?: number | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          stripe_payment_method_id?: string
          type?: string
          last_four?: string | null
          brand?: string | null
          exp_month?: number | null
          exp_year?: number | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_summaries: {
        Row: {
          id: string
          workspace_id: string
          period_start: string
          period_end: string
          emails_sent: number
          leads_processed: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          period_start: string
          period_end: string
          emails_sent?: number
          leads_processed?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          period_start?: string
          period_end?: string
          emails_sent?: number
          leads_processed?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // SMTP Infrastructure tables (010)
      smtp_providers: {
        Row: {
          id: string
          workspace_id: string | null
          name: string
          provider_type: 'ses' | 'sendgrid' | 'mailgun' | 'postmark' | 'sparkpost' | 'smtp'
          config: Json
          encrypted_credentials: string | null
          is_default: boolean
          status: 'active' | 'inactive' | 'error'
          rate_limit_per_second: number
          rate_limit_per_minute: number
          rate_limit_per_hour: number
          daily_limit: number
          sent_today: number
          health_score: number | null
          last_health_check: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          name: string
          provider_type: 'ses' | 'sendgrid' | 'mailgun' | 'postmark' | 'sparkpost' | 'smtp'
          config?: Json
          encrypted_credentials?: string | null
          is_default?: boolean
          status?: 'active' | 'inactive' | 'error'
          rate_limit_per_second?: number
          rate_limit_per_minute?: number
          rate_limit_per_hour?: number
          daily_limit?: number
          sent_today?: number
          health_score?: number | null
          last_health_check?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          name?: string
          provider_type?: 'ses' | 'sendgrid' | 'mailgun' | 'postmark' | 'sparkpost' | 'smtp'
          config?: Json
          encrypted_credentials?: string | null
          is_default?: boolean
          status?: 'active' | 'inactive' | 'error'
          rate_limit_per_second?: number
          rate_limit_per_minute?: number
          rate_limit_per_hour?: number
          daily_limit?: number
          sent_today?: number
          health_score?: number | null
          last_health_check?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      smtp_connections: {
        Row: {
          id: string
          provider_id: string
          pool_size: number
          active_connections: number
          idle_connections: number
          status: 'healthy' | 'degraded' | 'error'
          last_activity_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          pool_size?: number
          active_connections?: number
          idle_connections?: number
          status?: 'healthy' | 'degraded' | 'error'
          last_activity_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          pool_size?: number
          active_connections?: number
          idle_connections?: number
          status?: 'healthy' | 'degraded' | 'error'
          last_activity_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ip_pools: {
        Row: {
          id: string
          workspace_id: string | null
          name: string
          type: 'dedicated' | 'shared' | 'warmup'
          status: 'active' | 'inactive' | 'warming'
          selection_strategy: 'round_robin' | 'least_used' | 'random' | 'weighted'
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          name: string
          type?: 'dedicated' | 'shared' | 'warmup'
          status?: 'active' | 'inactive' | 'warming'
          selection_strategy?: 'round_robin' | 'least_used' | 'random' | 'weighted'
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          name?: string
          type?: 'dedicated' | 'shared' | 'warmup'
          status?: 'active' | 'inactive' | 'warming'
          selection_strategy?: 'round_robin' | 'least_used' | 'random' | 'weighted'
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sending_ips: {
        Row: {
          id: string
          pool_id: string | null
          provider_id: string | null
          ip_address: string
          hostname: string | null
          status: 'active' | 'warming' | 'cooldown' | 'blacklisted' | 'inactive'
          reputation_score: number | null
          warmup_day: number
          warmup_target_volume: number
          sent_today: number
          sent_this_hour: number
          bounce_rate: number
          complaint_rate: number
          weight: number
          last_used_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          pool_id?: string | null
          provider_id?: string | null
          ip_address: string
          hostname?: string | null
          status?: 'active' | 'warming' | 'cooldown' | 'blacklisted' | 'inactive'
          reputation_score?: number | null
          warmup_day?: number
          warmup_target_volume?: number
          sent_today?: number
          sent_this_hour?: number
          bounce_rate?: number
          complaint_rate?: number
          weight?: number
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          pool_id?: string | null
          provider_id?: string | null
          ip_address?: string
          hostname?: string | null
          status?: 'active' | 'warming' | 'cooldown' | 'blacklisted' | 'inactive'
          reputation_score?: number | null
          warmup_day?: number
          warmup_target_volume?: number
          sent_today?: number
          sent_this_hour?: number
          bounce_rate?: number
          complaint_rate?: number
          weight?: number
          last_used_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      warmup_schedules: {
        Row: {
          id: string
          mailbox_id: string | null
          ip_id: string | null
          day: number
          target_volume: number
          max_per_hour: number
          actual_sent: number
          created_at: string
        }
        Insert: {
          id?: string
          mailbox_id?: string | null
          ip_id?: string | null
          day: number
          target_volume: number
          max_per_hour?: number
          actual_sent?: number
          created_at?: string
        }
        Update: {
          id?: string
          mailbox_id?: string | null
          ip_id?: string | null
          day?: number
          target_volume?: number
          max_per_hour?: number
          actual_sent?: number
          created_at?: string
        }
        Relationships: []
      }
      warmup_pool: {
        Row: {
          id: string
          mailbox_id: string
          is_active: boolean
          warmup_sent_today: number
          warmup_received_today: number
          warmup_opened_today: number
          warmup_replied_today: number
          warmup_rescued_today: number
          join_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          mailbox_id: string
          is_active?: boolean
          warmup_sent_today?: number
          warmup_received_today?: number
          warmup_opened_today?: number
          warmup_replied_today?: number
          warmup_rescued_today?: number
          join_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          mailbox_id?: string
          is_active?: boolean
          warmup_sent_today?: number
          warmup_received_today?: number
          warmup_opened_today?: number
          warmup_replied_today?: number
          warmup_rescued_today?: number
          join_date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // IP Reputation Management tables (011)
      blacklist_providers: {
        Row: {
          id: string
          name: string
          dns_zone: string
          check_type: 'ip' | 'domain' | 'both'
          severity: 'critical' | 'high' | 'medium' | 'low'
          description: string | null
          delisting_url: string | null
          is_active: boolean
          check_interval_minutes: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          dns_zone: string
          check_type?: 'ip' | 'domain' | 'both'
          severity?: 'critical' | 'high' | 'medium' | 'low'
          description?: string | null
          delisting_url?: string | null
          is_active?: boolean
          check_interval_minutes?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          dns_zone?: string
          check_type?: 'ip' | 'domain' | 'both'
          severity?: 'critical' | 'high' | 'medium' | 'low'
          description?: string | null
          delisting_url?: string | null
          is_active?: boolean
          check_interval_minutes?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ip_blacklist_checks: {
        Row: {
          id: string
          ip_id: string | null
          provider_id: string
          is_listed: boolean
          listing_reason: string | null
          first_listed_at: string | null
          last_checked_at: string
          delisting_requested_at: string | null
          delisting_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          ip_id?: string | null
          provider_id: string
          is_listed?: boolean
          listing_reason?: string | null
          first_listed_at?: string | null
          last_checked_at?: string
          delisting_requested_at?: string | null
          delisting_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          ip_id?: string | null
          provider_id?: string
          is_listed?: boolean
          listing_reason?: string | null
          first_listed_at?: string | null
          last_checked_at?: string
          delisting_requested_at?: string | null
          delisting_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      domain_reputation: {
        Row: {
          id: string
          domain_id: string
          provider: 'google' | 'microsoft' | 'yahoo' | 'aggregate'
          reputation_score: number | null
          spam_rate: number
          bounce_rate: number
          complaint_rate: number
          authentication_rate: number
          last_checked_at: string | null
          trend: 'improving' | 'stable' | 'declining' | null
          details: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          domain_id: string
          provider: 'google' | 'microsoft' | 'yahoo' | 'aggregate'
          reputation_score?: number | null
          spam_rate?: number
          bounce_rate?: number
          complaint_rate?: number
          authentication_rate?: number
          last_checked_at?: string | null
          trend?: 'improving' | 'stable' | 'declining' | null
          details?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          domain_id?: string
          provider?: 'google' | 'microsoft' | 'yahoo' | 'aggregate'
          reputation_score?: number | null
          spam_rate?: number
          bounce_rate?: number
          complaint_rate?: number
          authentication_rate?: number
          last_checked_at?: string | null
          trend?: 'improving' | 'stable' | 'declining' | null
          details?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      mailbox_reputation: {
        Row: {
          id: string
          mailbox_id: string
          reputation_score: number
          health_status: 'healthy' | 'warning' | 'critical' | 'quarantined'
          bounce_rate_7d: number
          complaint_rate_7d: number
          open_rate_7d: number
          reply_rate_7d: number
          sent_7d: number
          delivered_7d: number
          is_quarantined: boolean
          quarantine_reason: string | null
          quarantined_at: string | null
          quarantine_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          mailbox_id: string
          reputation_score?: number
          health_status?: 'healthy' | 'warning' | 'critical' | 'quarantined'
          bounce_rate_7d?: number
          complaint_rate_7d?: number
          open_rate_7d?: number
          reply_rate_7d?: number
          sent_7d?: number
          delivered_7d?: number
          is_quarantined?: boolean
          quarantine_reason?: string | null
          quarantined_at?: string | null
          quarantine_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          mailbox_id?: string
          reputation_score?: number
          health_status?: 'healthy' | 'warning' | 'critical' | 'quarantined'
          bounce_rate_7d?: number
          complaint_rate_7d?: number
          open_rate_7d?: number
          reply_rate_7d?: number
          sent_7d?: number
          delivered_7d?: number
          is_quarantined?: boolean
          quarantine_reason?: string | null
          quarantined_at?: string | null
          quarantine_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ip_rotation_rules: {
        Row: {
          id: string
          workspace_id: string | null
          pool_id: string | null
          name: string
          rule_type: 'round_robin' | 'weighted' | 'failover' | 'domain_based'
          config: Json
          priority: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          pool_id?: string | null
          name: string
          rule_type: 'round_robin' | 'weighted' | 'failover' | 'domain_based'
          config?: Json
          priority?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          pool_id?: string | null
          name?: string
          rule_type?: 'round_robin' | 'weighted' | 'failover' | 'domain_based'
          config?: Json
          priority?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ip_assignment_history: {
        Row: {
          id: string
          email_queue_id: string | null
          ip_id: string
          assigned_at: string
          assignment_reason: string | null
          rule_id: string | null
        }
        Insert: {
          id?: string
          email_queue_id?: string | null
          ip_id: string
          assigned_at?: string
          assignment_reason?: string | null
          rule_id?: string | null
        }
        Update: {
          id?: string
          email_queue_id?: string | null
          ip_id?: string
          assigned_at?: string
          assignment_reason?: string | null
          rule_id?: string | null
        }
        Relationships: []
      }
      reputation_alerts: {
        Row: {
          id: string
          workspace_id: string | null
          alert_type: 'blacklist' | 'bounce_rate' | 'complaint_rate' | 'reputation_drop' | 'authentication_failure'
          severity: 'critical' | 'high' | 'medium' | 'low'
          entity_type: 'ip' | 'domain' | 'mailbox'
          entity_id: string
          message: string
          details: Json
          is_acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          alert_type: 'blacklist' | 'bounce_rate' | 'complaint_rate' | 'reputation_drop' | 'authentication_failure'
          severity: 'critical' | 'high' | 'medium' | 'low'
          entity_type: 'ip' | 'domain' | 'mailbox'
          entity_id: string
          message: string
          details?: Json
          is_acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          resolved_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          alert_type?: 'blacklist' | 'bounce_rate' | 'complaint_rate' | 'reputation_drop' | 'authentication_failure'
          severity?: 'critical' | 'high' | 'medium' | 'low'
          entity_type?: 'ip' | 'domain' | 'mailbox'
          entity_id?: string
          message?: string
          details?: Json
          is_acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          resolved_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      reputation_recovery_tasks: {
        Row: {
          id: string
          alert_id: string | null
          entity_type: 'ip' | 'domain' | 'mailbox'
          entity_id: string
          task_type: 'warmup' | 'delisting' | 'volume_reduction' | 'manual_review'
          status: 'pending' | 'in_progress' | 'completed' | 'failed'
          config: Json
          started_at: string | null
          completed_at: string | null
          result: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          alert_id?: string | null
          entity_type: 'ip' | 'domain' | 'mailbox'
          entity_id: string
          task_type: 'warmup' | 'delisting' | 'volume_reduction' | 'manual_review'
          status?: 'pending' | 'in_progress' | 'completed' | 'failed'
          config?: Json
          started_at?: string | null
          completed_at?: string | null
          result?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          alert_id?: string | null
          entity_type?: 'ip' | 'domain' | 'mailbox'
          entity_id?: string
          task_type?: 'warmup' | 'delisting' | 'volume_reduction' | 'manual_review'
          status?: 'pending' | 'in_progress' | 'completed' | 'failed'
          config?: Json
          started_at?: string | null
          completed_at?: string | null
          result?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Integrations tables (013)
      webhooks: {
        Row: {
          id: string
          workspace_id: string
          integration_id: string | null
          name: string
          url: string
          secret: string
          events: string[]
          is_active: boolean
          headers: Json
          retry_policy: Json
          last_triggered_at: string | null
          failure_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          integration_id?: string | null
          name: string
          url: string
          secret: string
          events?: string[]
          is_active?: boolean
          headers?: Json
          retry_policy?: Json
          last_triggered_at?: string | null
          failure_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          integration_id?: string | null
          name?: string
          url?: string
          secret?: string
          events?: string[]
          is_active?: boolean
          headers?: Json
          retry_policy?: Json
          last_triggered_at?: string | null
          failure_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          id: string
          webhook_id: string
          event: string
          payload: Json
          status: 'pending' | 'success' | 'failed'
          status_code: number | null
          response: string | null
          attempts: number
          next_retry_at: string | null
          created_at: string
          delivered_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          webhook_id: string
          event: string
          payload: Json
          status?: 'pending' | 'success' | 'failed'
          status_code?: number | null
          response?: string | null
          attempts?: number
          next_retry_at?: string | null
          created_at?: string
          delivered_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          webhook_id?: string
          event?: string
          payload?: Json
          status?: 'pending' | 'success' | 'failed'
          status_code?: number | null
          response?: string | null
          attempts?: number
          next_retry_at?: string | null
          created_at?: string
          delivered_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          id: string
          integration_id: string
          workspace_id: string
          direction: 'inbound' | 'outbound' | 'bidirectional'
          status: string
          started_at: string | null
          completed_at: string | null
          records_processed: number
          records_created: number
          records_updated: number
          records_deleted: number
          records_failed: number
          errors: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          integration_id: string
          workspace_id: string
          direction: 'inbound' | 'outbound' | 'bidirectional'
          status?: string
          started_at?: string | null
          completed_at?: string | null
          records_processed?: number
          records_created?: number
          records_updated?: number
          records_deleted?: number
          records_failed?: number
          errors?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          integration_id?: string
          workspace_id?: string
          direction?: 'inbound' | 'outbound' | 'bidirectional'
          status?: string
          started_at?: string | null
          completed_at?: string | null
          records_processed?: number
          records_created?: number
          records_updated?: number
          records_deleted?: number
          records_failed?: number
          errors?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      field_mappings: {
        Row: {
          id: string
          integration_id: string
          source_field: string
          target_field: string
          transform: string | null
          is_required: boolean
          default_value: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          integration_id: string
          source_field: string
          target_field: string
          transform?: string | null
          is_required?: boolean
          default_value?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          integration_id?: string
          source_field?: string
          target_field?: string
          transform?: string | null
          is_required?: boolean
          default_value?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          id: string
          integration_id: string
          action: string
          status: string
          message: string | null
          details: Json | null
          sync_job_id: string | null
          record_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          integration_id: string
          action: string
          status: string
          message?: string | null
          details?: Json | null
          sync_job_id?: string | null
          record_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          integration_id?: string
          action?: string
          status?: string
          message?: string | null
          details?: Json | null
          sync_job_id?: string | null
          record_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      // API tables (015)
      api_keys: {
        Row: {
          id: string
          workspace_id: string
          name: string
          key_prefix: string
          key_hash: string
          permissions: Json
          status: 'active' | 'revoked' | 'expired'
          rate_limit: number
          last_used_at: string | null
          last_used_ip: string | null
          expires_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          key_prefix: string
          key_hash: string
          permissions?: Json
          status?: 'active' | 'revoked' | 'expired'
          rate_limit?: number
          last_used_at?: string | null
          last_used_ip?: string | null
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          key_prefix?: string
          key_hash?: string
          permissions?: Json
          status?: 'active' | 'revoked' | 'expired'
          rate_limit?: number
          last_used_at?: string | null
          last_used_ip?: string | null
          expires_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          id: string
          workspace_id: string
          name: string
          description: string | null
          client_id: string
          client_secret_hash: string
          redirect_uris: Json
          allowed_scopes: Json
          allowed_grant_types: Json
          is_confidential: boolean
          logo_url: string | null
          homepage_url: string | null
          privacy_policy_url: string | null
          terms_of_service_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          description?: string | null
          client_id: string
          client_secret_hash: string
          redirect_uris?: Json
          allowed_scopes?: Json
          allowed_grant_types?: Json
          is_confidential?: boolean
          logo_url?: string | null
          homepage_url?: string | null
          privacy_policy_url?: string | null
          terms_of_service_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          description?: string | null
          client_id?: string
          client_secret_hash?: string
          redirect_uris?: Json
          allowed_scopes?: Json
          allowed_grant_types?: Json
          is_confidential?: boolean
          logo_url?: string | null
          homepage_url?: string | null
          privacy_policy_url?: string | null
          terms_of_service_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_authorization_codes: {
        Row: {
          id: string
          client_id: string
          user_id: string
          workspace_id: string
          code: string
          code_challenge: string | null
          code_challenge_method: string | null
          scope: Json
          redirect_uri: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          user_id: string
          workspace_id: string
          code: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          scope?: Json
          redirect_uri: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          user_id?: string
          workspace_id?: string
          code?: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          scope?: Json
          redirect_uri?: string
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
      oauth_access_tokens: {
        Row: {
          id: string
          client_id: string
          user_id: string
          workspace_id: string
          access_token: string
          refresh_token: string | null
          scope: Json
          expires_at: string
          refresh_expires_at: string | null
          last_used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          user_id: string
          workspace_id: string
          access_token: string
          refresh_token?: string | null
          scope?: Json
          expires_at: string
          refresh_expires_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          user_id?: string
          workspace_id?: string
          access_token?: string
          refresh_token?: string | null
          scope?: Json
          expires_at?: string
          refresh_expires_at?: string | null
          last_used_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      developer_webhooks: {
        Row: {
          id: string
          workspace_id: string
          name: string
          url: string
          secret: string
          events: Json
          is_active: boolean
          version: string
          failure_count: number
          last_triggered_at: string | null
          last_success_at: string | null
          last_failure_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          url: string
          secret: string
          events?: Json
          is_active?: boolean
          version?: string
          failure_count?: number
          last_triggered_at?: string | null
          last_success_at?: string | null
          last_failure_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          url?: string
          secret?: string
          events?: Json
          is_active?: boolean
          version?: string
          failure_count?: number
          last_triggered_at?: string | null
          last_success_at?: string | null
          last_failure_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_delivery_queue: {
        Row: {
          id: string
          webhook_id: string
          payload_id: string
          payload: Json
          attempts: number
          next_attempt_at: string
          status: 'pending' | 'delivered' | 'failed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          webhook_id: string
          payload_id: string
          payload: Json
          attempts?: number
          next_attempt_at?: string
          status?: 'pending' | 'delivered' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          webhook_id?: string
          payload_id?: string
          payload?: Json
          attempts?: number
          next_attempt_at?: string
          status?: 'pending' | 'delivered' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_delivery_attempts: {
        Row: {
          id: string
          webhook_id: string
          payload_id: string
          attempt: number
          status_code: number | null
          response_body: string | null
          error: string | null
          duration: number
          created_at: string
        }
        Insert: {
          id?: string
          webhook_id: string
          payload_id: string
          attempt: number
          status_code?: number | null
          response_body?: string | null
          error?: string | null
          duration: number
          created_at?: string
        }
        Update: {
          id?: string
          webhook_id?: string
          payload_id?: string
          attempt?: number
          status_code?: number | null
          response_body?: string | null
          error?: string | null
          duration?: number
          created_at?: string
        }
        Relationships: []
      }
      api_logs: {
        Row: {
          id: string
          workspace_id: string
          api_key_id: string | null
          oauth_token_id: string | null
          request_id: string
          method: string
          path: string
          query_params: Json | null
          request_body: Json | null
          status_code: number
          response_body: Json | null
          duration: number
          ip_address: string | null
          user_agent: string | null
          error_code: string | null
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          api_key_id?: string | null
          oauth_token_id?: string | null
          request_id: string
          method: string
          path: string
          query_params?: Json | null
          request_body?: Json | null
          status_code: number
          response_body?: Json | null
          duration: number
          ip_address?: string | null
          user_agent?: string | null
          error_code?: string | null
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          api_key_id?: string | null
          oauth_token_id?: string | null
          request_id?: string
          method?: string
          path?: string
          query_params?: Json | null
          request_body?: Json | null
          status_code?: number
          response_body?: Json | null
          duration?: number
          ip_address?: string | null
          user_agent?: string | null
          error_code?: string | null
          error_message?: string | null
          created_at?: string
        }
        Relationships: []
      }
      // White-label/Agency tables (016)
      agencies: {
        Row: {
          id: string
          name: string
          slug: string
          owner_id: string
          plan: 'starter' | 'growth' | 'enterprise'
          status: 'active' | 'suspended' | 'cancelled'
          settings: Json
          branding: Json
          limits: Json
          max_sub_accounts: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          owner_id: string
          plan?: 'starter' | 'growth' | 'enterprise'
          status?: 'active' | 'suspended' | 'cancelled'
          settings?: Json
          branding?: Json
          limits?: Json
          max_sub_accounts?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          owner_id?: string
          plan?: 'starter' | 'growth' | 'enterprise'
          status?: 'active' | 'suspended' | 'cancelled'
          settings?: Json
          branding?: Json
          limits?: Json
          max_sub_accounts?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sub_accounts: {
        Row: {
          id: string
          agency_id: string
          name: string
          slug: string
          owner_email: string | null
          status: 'active' | 'suspended' | 'pending'
          settings: Json
          limits: Json
          usage: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          name: string
          slug: string
          owner_email?: string | null
          status?: 'active' | 'suspended' | 'pending'
          settings?: Json
          limits?: Json
          usage?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          name?: string
          slug?: string
          owner_email?: string | null
          status?: 'active' | 'suspended' | 'pending'
          settings?: Json
          limits?: Json
          usage?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_members: {
        Row: {
          id: string
          agency_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          permissions: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          permissions?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member'
          permissions?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_invitations: {
        Row: {
          id: string
          agency_id: string
          email: string
          role: 'owner' | 'admin' | 'member'
          token: string
          invited_by: string
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          email: string
          role?: 'owner' | 'admin' | 'member'
          token: string
          invited_by: string
          expires_at: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          email?: string
          role?: 'owner' | 'admin' | 'member'
          token?: string
          invited_by?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      sub_account_invitations: {
        Row: {
          id: string
          sub_account_id: string
          email: string
          role: 'admin' | 'member' | 'viewer'
          token: string
          invited_by: string
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          sub_account_id: string
          email: string
          role?: 'admin' | 'member' | 'viewer'
          token: string
          invited_by: string
          expires_at: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          sub_account_id?: string
          email?: string
          role?: 'admin' | 'member' | 'viewer'
          token?: string
          invited_by?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      custom_domains: {
        Row: {
          id: string
          agency_id: string
          domain: string
          type: 'app' | 'email' | 'tracking'
          status: 'pending' | 'verifying' | 'active' | 'failed'
          verification_token: string | null
          verified_at: string | null
          ssl_status: 'pending' | 'active' | 'failed' | null
          ssl_expires_at: string | null
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          domain: string
          type?: 'app' | 'email' | 'tracking'
          status?: 'pending' | 'verifying' | 'active' | 'failed'
          verification_token?: string | null
          verified_at?: string | null
          ssl_status?: 'pending' | 'active' | 'failed' | null
          ssl_expires_at?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          domain?: string
          type?: 'app' | 'email' | 'tracking'
          status?: 'pending' | 'verifying' | 'active' | 'failed'
          verification_token?: string | null
          verified_at?: string | null
          ssl_status?: 'pending' | 'active' | 'failed' | null
          ssl_expires_at?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      whitelabel_email_configs: {
        Row: {
          id: string
          agency_id: string
          from_name: string
          from_email: string
          reply_to: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_username: string | null
          smtp_password_encrypted: string | null
          dkim_selector: string | null
          dkim_private_key_encrypted: string | null
          is_verified: boolean
          verified_at: string | null
          templates: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          from_name: string
          from_email: string
          reply_to?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          smtp_password_encrypted?: string | null
          dkim_selector?: string | null
          dkim_private_key_encrypted?: string | null
          is_verified?: boolean
          verified_at?: string | null
          templates?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          from_name?: string
          from_email?: string
          reply_to?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          smtp_password_encrypted?: string | null
          dkim_selector?: string | null
          dkim_private_key_encrypted?: string | null
          is_verified?: boolean
          verified_at?: string | null
          templates?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reseller_configs: {
        Row: {
          id: string
          agency_id: string
          is_reseller: boolean
          markup_percentage: number
          commission_rate: number
          payout_method: 'stripe' | 'paypal' | 'bank_transfer' | 'manual'
          payout_details: Json
          min_payout_amount: number
          auto_payout: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          is_reseller?: boolean
          markup_percentage?: number
          commission_rate?: number
          payout_method?: 'stripe' | 'paypal' | 'bank_transfer' | 'manual'
          payout_details?: Json
          min_payout_amount?: number
          auto_payout?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          is_reseller?: boolean
          markup_percentage?: number
          commission_rate?: number
          payout_method?: 'stripe' | 'paypal' | 'bank_transfer' | 'manual'
          payout_details?: Json
          min_payout_amount?: number
          auto_payout?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reseller_commissions: {
        Row: {
          id: string
          agency_id: string
          sub_account_id: string | null
          period_start: string
          period_end: string
          revenue: number
          commission_rate: number
          commission_amount: number
          status: 'pending' | 'approved' | 'paid' | 'cancelled'
          payout_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          sub_account_id?: string | null
          period_start: string
          period_end: string
          revenue?: number
          commission_rate: number
          commission_amount?: number
          status?: 'pending' | 'approved' | 'paid' | 'cancelled'
          payout_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          sub_account_id?: string | null
          period_start?: string
          period_end?: string
          revenue?: number
          commission_rate?: number
          commission_amount?: number
          status?: 'pending' | 'approved' | 'paid' | 'cancelled'
          payout_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reseller_payouts: {
        Row: {
          id: string
          agency_id: string
          amount: number
          currency: string
          method: 'stripe' | 'paypal' | 'bank_transfer' | 'manual'
          status: 'pending' | 'processing' | 'completed' | 'failed'
          reference: string | null
          notes: string | null
          processed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          amount: number
          currency?: string
          method: 'stripe' | 'paypal' | 'bank_transfer' | 'manual'
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          reference?: string | null
          notes?: string | null
          processed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          amount?: number
          currency?: string
          method?: 'stripe' | 'paypal' | 'bank_transfer' | 'manual'
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          reference?: string | null
          notes?: string | null
          processed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_activity_logs: {
        Row: {
          id: string
          agency_id: string
          sub_account_id: string | null
          actor_type: 'user' | 'system' | 'api'
          actor_id: string | null
          action: string
          resource_type: string
          resource_id: string | null
          details: Json
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          sub_account_id?: string | null
          actor_type: 'user' | 'system' | 'api'
          actor_id?: string | null
          action: string
          resource_type: string
          resource_id?: string | null
          details?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          sub_account_id?: string | null
          actor_type?: 'user' | 'system' | 'api'
          actor_id?: string | null
          action?: string
          resource_type?: string
          resource_id?: string | null
          details?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      agency_analytics: {
        Row: {
          id: string
          agency_id: string
          date: string
          metrics: Json
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          date: string
          metrics?: Json
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          date?: string
          metrics?: Json
          created_at?: string
        }
        Relationships: []
      }
      // Scale & Performance tables (017)
      jobs: {
        Row: {
          id: string
          queue_name: string
          job_name: string
          data: Json
          status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
          priority: number
          progress: number
          attempts: number
          max_attempts: number
          options: Json
          result: Json | null
          error: string | null
          process_at: string | null
          started_at: string | null
          completed_at: string | null
          workspace_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          queue_name: string
          job_name: string
          data?: Json
          status?: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
          priority?: number
          progress?: number
          attempts?: number
          max_attempts?: number
          options?: Json
          result?: Json | null
          error?: string | null
          process_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          workspace_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          queue_name?: string
          job_name?: string
          data?: Json
          status?: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
          priority?: number
          progress?: number
          attempts?: number
          max_attempts?: number
          options?: Json
          result?: Json | null
          error?: string | null
          process_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          workspace_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      failed_jobs: {
        Row: {
          id: string
          job_id: string
          queue_name: string
          job_name: string
          data: Json
          error: string
          attempts: number
          failed_at: string
        }
        Insert: {
          id?: string
          job_id: string
          queue_name: string
          job_name: string
          data: Json
          error: string
          attempts: number
          failed_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          queue_name?: string
          job_name?: string
          data?: Json
          error?: string
          attempts?: number
          failed_at?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          id: string
          identifier: string
          key_prefix: string
          points: number
          window_start: string
          window_end: string
          blocked_until: string | null
          created_at: string
        }
        Insert: {
          id?: string
          identifier: string
          key_prefix: string
          points?: number
          window_start: string
          window_end: string
          blocked_until?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          identifier?: string
          key_prefix?: string
          points?: number
          window_start?: string
          window_end?: string
          blocked_until?: string | null
          created_at?: string
        }
        Relationships: []
      }
      metric_aggregates: {
        Row: {
          id: string
          metric_name: string
          metric_type: 'counter' | 'gauge' | 'histogram'
          labels: Json
          period_start: string
          period_end: string
          count: number
          sum: number | null
          min: number | null
          max: number | null
          avg: number | null
          p50: number | null
          p95: number | null
          p99: number | null
          workspace_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          metric_name: string
          metric_type: 'counter' | 'gauge' | 'histogram'
          labels?: Json
          period_start: string
          period_end: string
          count?: number
          sum?: number | null
          min?: number | null
          max?: number | null
          avg?: number | null
          p50?: number | null
          p95?: number | null
          p99?: number | null
          workspace_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          metric_name?: string
          metric_type?: 'counter' | 'gauge' | 'histogram'
          labels?: Json
          period_start?: string
          period_end?: string
          count?: number
          sum?: number | null
          min?: number | null
          max?: number | null
          avg?: number | null
          p50?: number | null
          p95?: number | null
          p99?: number | null
          workspace_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      slow_query_log: {
        Row: {
          id: string
          query_hash: string
          query_pattern: string
          duration_ms: number
          calls: number
          total_time_ms: number
          avg_time_ms: number | null
          max_time_ms: number | null
          first_seen: string
          last_seen: string
        }
        Insert: {
          id?: string
          query_hash: string
          query_pattern: string
          duration_ms: number
          calls?: number
          total_time_ms?: number
          avg_time_ms?: number | null
          max_time_ms?: number | null
          first_seen?: string
          last_seen?: string
        }
        Update: {
          id?: string
          query_hash?: string
          query_pattern?: string
          duration_ms?: number
          calls?: number
          total_time_ms?: number
          avg_time_ms?: number | null
          max_time_ms?: number | null
          first_seen?: string
          last_seen?: string
        }
        Relationships: []
      }
      circuit_breaker_states: {
        Row: {
          id: string
          name: string
          state: 'closed' | 'open' | 'half-open'
          failures: number
          successes: number
          last_failure: string | null
          next_retry: string | null
          config: Json
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          state?: 'closed' | 'open' | 'half-open'
          failures?: number
          successes?: number
          last_failure?: string | null
          next_retry?: string | null
          config?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          state?: 'closed' | 'open' | 'half-open'
          failures?: number
          successes?: number
          last_failure?: string | null
          next_retry?: string | null
          config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cache_invalidations: {
        Row: {
          id: string
          cache_key: string
          pattern: string | null
          reason: string | null
          tags: string[] | null
          invalidated_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          cache_key: string
          pattern?: string | null
          reason?: string | null
          tags?: string[] | null
          invalidated_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          cache_key?: string
          pattern?: string | null
          reason?: string | null
          tags?: string[] | null
          invalidated_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      server_health_log: {
        Row: {
          id: string
          server_id: string
          host: string
          port: number
          healthy: boolean
          response_time_ms: number | null
          error_message: string | null
          checked_at: string
        }
        Insert: {
          id?: string
          server_id: string
          host: string
          port: number
          healthy: boolean
          response_time_ms?: number | null
          error_message?: string | null
          checked_at?: string
        }
        Update: {
          id?: string
          server_id?: string
          host?: string
          port?: number
          healthy?: boolean
          response_time_ms?: number | null
          error_message?: string | null
          checked_at?: string
        }
        Relationships: []
      }
      system_status: {
        Row: {
          id: string
          component: string
          status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
          message: string | null
          details: Json
          checked_at: string
        }
        Insert: {
          id?: string
          component: string
          status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
          message?: string | null
          details?: Json
          checked_at?: string
        }
        Update: {
          id?: string
          component?: string
          status?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
          message?: string | null
          details?: Json
          checked_at?: string
        }
        Relationships: []
      }
      scale_feature_flags: {
        Row: {
          id: string
          name: string
          enabled: boolean
          config: Json
          description: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          name: string
          enabled?: boolean
          config?: Json
          description?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          enabled?: boolean
          config?: Json
          description?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      // Organization members table
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
        }
        Relationships: []
      }
      // Lead tags table
      lead_tags: {
        Row: {
          id: string
          organization_id: string
          name: string
          color: string
          lead_count: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          color?: string
          lead_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          color?: string
          lead_count?: number
          created_at?: string
        }
        Relationships: []
      }
      // Email provider configurations (from 009_mailbox_provisioning.sql)
      email_provider_configs: {
        Row: {
          id: string
          workspace_id: string
          provider: 'google' | 'microsoft' | 'custom'
          config_name: string
          oauth_credentials_encrypted: string | null
          service_account_key_encrypted: string | null
          domain: string
          admin_email: string | null
          customer_id: string | null
          is_active: boolean
          verified_at: string | null
          last_sync_at: string | null
          mailbox_limit: number
          mailboxes_created: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          provider: 'google' | 'microsoft' | 'custom'
          config_name: string
          oauth_credentials_encrypted?: string | null
          service_account_key_encrypted?: string | null
          domain: string
          admin_email?: string | null
          customer_id?: string | null
          is_active?: boolean
          verified_at?: string | null
          last_sync_at?: string | null
          mailbox_limit?: number
          mailboxes_created?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          provider?: 'google' | 'microsoft' | 'custom'
          config_name?: string
          oauth_credentials_encrypted?: string | null
          service_account_key_encrypted?: string | null
          domain?: string
          admin_email?: string | null
          customer_id?: string | null
          is_active?: boolean
          verified_at?: string | null
          last_sync_at?: string | null
          mailbox_limit?: number
          mailboxes_created?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Provisioned mailboxes (from 009_mailbox_provisioning.sql)
      provisioned_mailboxes: {
        Row: {
          id: string
          workspace_id: string
          provider_config_id: string
          domain_id: string | null
          email_address: string
          display_name: string
          first_name: string
          last_name: string
          provider_user_id: string | null
          password_encrypted: string | null
          recovery_email: string | null
          recovery_phone: string | null
          profile_photo_url: string | null
          signature_html: string | null
          signature_plain: string | null
          aliases: string[]
          status: 'pending' | 'creating' | 'active' | 'suspended' | 'deleted' | 'error'
          error_message: string | null
          warmup_status: 'not_started' | 'in_progress' | 'completed' | 'paused'
          warmup_started_at: string | null
          warmup_completed_at: string | null
          emails_sent_today: number
          emails_sent_total: number
          last_sent_at: string | null
          provisioned_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          provider_config_id: string
          domain_id?: string | null
          email_address: string
          display_name: string
          first_name: string
          last_name: string
          provider_user_id?: string | null
          password_encrypted?: string | null
          recovery_email?: string | null
          recovery_phone?: string | null
          profile_photo_url?: string | null
          signature_html?: string | null
          signature_plain?: string | null
          aliases?: string[]
          status?: 'pending' | 'creating' | 'active' | 'suspended' | 'deleted' | 'error'
          error_message?: string | null
          warmup_status?: 'not_started' | 'in_progress' | 'completed' | 'paused'
          warmup_started_at?: string | null
          warmup_completed_at?: string | null
          emails_sent_today?: number
          emails_sent_total?: number
          last_sent_at?: string | null
          provisioned_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          provider_config_id?: string
          domain_id?: string | null
          email_address?: string
          display_name?: string
          first_name?: string
          last_name?: string
          provider_user_id?: string | null
          password_encrypted?: string | null
          recovery_email?: string | null
          recovery_phone?: string | null
          profile_photo_url?: string | null
          signature_html?: string | null
          signature_plain?: string | null
          aliases?: string[]
          status?: 'pending' | 'creating' | 'active' | 'suspended' | 'deleted' | 'error'
          error_message?: string | null
          warmup_status?: 'not_started' | 'in_progress' | 'completed' | 'paused'
          warmup_started_at?: string | null
          warmup_completed_at?: string | null
          emails_sent_today?: number
          emails_sent_total?: number
          last_sent_at?: string | null
          provisioned_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Mailbox provisioning queue
      mailbox_provisioning_queue: {
        Row: {
          id: string
          workspace_id: string
          provider_config_id: string
          email_address: string
          display_name: string
          first_name: string
          last_name: string
          password: string | null
          generate_aliases: boolean
          alias_count: number
          set_profile_photo: boolean
          set_signature: boolean
          start_warmup: boolean
          status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          priority: number
          attempts: number
          max_attempts: number
          error_message: string | null
          provisioned_mailbox_id: string | null
          scheduled_at: string
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          provider_config_id: string
          email_address: string
          display_name: string
          first_name: string
          last_name: string
          password?: string | null
          generate_aliases?: boolean
          alias_count?: number
          set_profile_photo?: boolean
          set_signature?: boolean
          start_warmup?: boolean
          status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          priority?: number
          attempts?: number
          max_attempts?: number
          error_message?: string | null
          provisioned_mailbox_id?: string | null
          scheduled_at?: string
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          provider_config_id?: string
          email_address?: string
          display_name?: string
          first_name?: string
          last_name?: string
          password?: string | null
          generate_aliases?: boolean
          alias_count?: number
          set_profile_photo?: boolean
          set_signature?: boolean
          start_warmup?: boolean
          status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          priority?: number
          attempts?: number
          max_attempts?: number
          error_message?: string | null
          provisioned_mailbox_id?: string | null
          scheduled_at?: string
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      // Signature templates
      signature_templates: {
        Row: {
          id: string
          workspace_id: string
          name: string
          description: string | null
          html_template: string
          plain_template: string
          variables: Json
          default_values: Json
          is_default: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          description?: string | null
          html_template: string
          plain_template: string
          variables?: Json
          default_values?: Json
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          description?: string | null
          html_template?: string
          plain_template?: string
          variables?: Json
          default_values?: Json
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Profile photos pool
      profile_photos_pool: {
        Row: {
          id: string
          workspace_id: string | null
          photo_url: string
          photo_storage_path: string | null
          gender: 'male' | 'female' | 'neutral' | null
          style: 'professional' | 'casual' | 'creative'
          times_used: number
          last_used_at: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          photo_url: string
          photo_storage_path?: string | null
          gender?: 'male' | 'female' | 'neutral' | null
          style?: 'professional' | 'casual' | 'creative'
          times_used?: number
          last_used_at?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          photo_url?: string
          photo_storage_path?: string | null
          gender?: 'male' | 'female' | 'neutral' | null
          style?: 'professional' | 'casual' | 'creative'
          times_used?: number
          last_used_at?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      // Name patterns
      name_patterns: {
        Row: {
          id: string
          workspace_id: string | null
          pattern_type: 'first_name' | 'last_name' | 'alias_prefix' | 'alias_suffix'
          value: string
          gender: 'male' | 'female' | 'neutral' | null
          region: string
          frequency_score: number
          times_used: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id?: string | null
          pattern_type: 'first_name' | 'last_name' | 'alias_prefix' | 'alias_suffix'
          value: string
          gender?: 'male' | 'female' | 'neutral' | null
          region?: string
          frequency_score?: number
          times_used?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string | null
          pattern_type?: 'first_name' | 'last_name' | 'alias_prefix' | 'alias_suffix'
          value?: string
          gender?: 'male' | 'female' | 'neutral' | null
          region?: string
          frequency_score?: number
          times_used?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      // Bulk provisioning jobs
      bulk_provisioning_jobs: {
        Row: {
          id: string
          workspace_id: string
          provider_config_id: string
          name: string
          mailbox_count: number
          settings: Json
          status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
          total_count: number
          completed_count: number
          failed_count: number
          created_mailbox_ids: string[]
          errors: Json
          started_at: string | null
          completed_at: string | null
          estimated_completion: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          provider_config_id: string
          name: string
          mailbox_count: number
          settings?: Json
          status?: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
          total_count: number
          completed_count?: number
          failed_count?: number
          created_mailbox_ids?: string[]
          errors?: Json
          started_at?: string | null
          completed_at?: string | null
          estimated_completion?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          provider_config_id?: string
          name?: string
          mailbox_count?: number
          settings?: Json
          status?: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
          total_count?: number
          completed_count?: number
          failed_count?: number
          created_mailbox_ids?: string[]
          errors?: Json
          started_at?: string | null
          completed_at?: string | null
          estimated_completion?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
      increment_campaign_stat: {
        Args: {
          p_campaign_id: string
          p_stat: string
        }
        Returns: void
      }
      increment_thread_message_count: {
        Args: {
          p_thread_id: string
        }
        Returns: void
      }
      increment_mailbox_spam_complaints: {
        Args: {
          p_mailbox_id: string
        }
        Returns: void
      }
      increment_warmup_sent: {
        Args: {
          row_id: string
        }
        Returns: void
      }
      increment_warmup_received: {
        Args: {
          row_id: string
        }
        Returns: void
      }
      increment_warmup_opened: {
        Args: {
          row_id: string
        }
        Returns: void
      }
      increment_warmup_replied: {
        Args: {
          row_id: string
        }
        Returns: void
      }
      increment_warmup_rescued: {
        Args: {
          row_id: string
        }
        Returns: void
      }
      reset_warmup_daily: {
        Args: Record<PropertyKey, never>
        Returns: void
      }
      increment_ip_usage: {
        Args: {
          p_ip_id: string
        }
        Returns: void
      }
      increment_variant_stat: {
        Args: {
          p_variant_id: string
          p_stat: string
        }
        Returns: void
      }
      count_events_by_type: {
        Args: {
          p_workspace_id: string
          p_start_date: string
          p_end_date: string
        }
        Returns: Json
      }
      increment_email_open_count: {
        Args: {
          p_email_id: string
        }
        Returns: void
      }
      increment_email_click_count: {
        Args: {
          p_email_id: string
        }
        Returns: void
      }
      aggregate_daily_metrics: {
        Args: {
          p_workspace_id: string
          p_date: string
        }
        Returns: void
      }
      cleanup_old_analytics_events: {
        Args: {
          p_days: number
        }
        Returns: number
      }
      expire_api_keys: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_expired_auth_codes: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_expired_tokens: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_old_api_logs: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_old_webhook_attempts: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      generate_api_usage_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      expire_agency_invitations: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      expire_sub_account_invitations: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      calculate_agency_analytics: {
        Args: {
          p_agency_id: string
          p_date: string
        }
        Returns: void
      }
      reset_monthly_email_usage: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_integration_sync_stats: {
        Args: {
          p_integration_id: string
        }
        Returns: Json
      }
      count_unique_opens: {
        Args: {
          p_campaign_id: string
        }
        Returns: number
      }
      count_unique_clicks: {
        Args: {
          p_campaign_id: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
