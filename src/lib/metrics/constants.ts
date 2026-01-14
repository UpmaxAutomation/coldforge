// Metric name constants for InstantScale
// Organized by category for easy discovery and consistency

export const METRICS = {
  // ============= HTTP Metrics =============
  /** Total HTTP requests received */
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  /** HTTP request duration in milliseconds */
  HTTP_REQUEST_DURATION_MS: 'http_request_duration_ms',
  /** Total HTTP errors */
  HTTP_ERRORS_TOTAL: 'http_errors_total',
  /** Currently active HTTP requests */
  HTTP_ACTIVE_REQUESTS: 'http_active_requests',

  // ============= Email Metrics =============
  /** Total emails sent successfully */
  EMAILS_SENT_TOTAL: 'emails_sent_total',
  /** Total email send failures */
  EMAILS_FAILED_TOTAL: 'emails_failed_total',
  /** Email send duration in milliseconds */
  EMAIL_SEND_DURATION_MS: 'email_send_duration_ms',
  /** Email queue size */
  EMAIL_QUEUE_SIZE: 'email_queue_size',
  /** Email retry count */
  EMAIL_RETRIES_TOTAL: 'email_retries_total',
  /** Email bounce count */
  EMAIL_BOUNCES_TOTAL: 'email_bounces_total',
  /** Email opens tracked */
  EMAIL_OPENS_TOTAL: 'email_opens_total',
  /** Email clicks tracked */
  EMAIL_CLICKS_TOTAL: 'email_clicks_total',

  // ============= Campaign Metrics =============
  /** Total campaigns created */
  CAMPAIGNS_CREATED: 'campaigns_created_total',
  /** Total campaigns started */
  CAMPAIGNS_STARTED: 'campaigns_started_total',
  /** Total campaigns paused */
  CAMPAIGNS_PAUSED: 'campaigns_paused_total',
  /** Total campaigns completed */
  CAMPAIGNS_COMPLETED: 'campaigns_completed_total',
  /** Currently active campaigns */
  CAMPAIGNS_ACTIVE: 'campaigns_active',

  // ============= Lead Metrics =============
  /** Total leads created */
  LEADS_CREATED: 'leads_created_total',
  /** Total leads contacted */
  LEADS_CONTACTED: 'leads_contacted_total',
  /** Total leads imported */
  LEADS_IMPORTED: 'leads_imported_total',
  /** Total leads unsubscribed */
  LEADS_UNSUBSCRIBED: 'leads_unsubscribed_total',

  // ============= Auth Metrics =============
  /** Total successful logins */
  AUTH_LOGINS_TOTAL: 'auth_logins_total',
  /** Total failed login attempts */
  AUTH_FAILURES_TOTAL: 'auth_failures_total',
  /** Total logout events */
  AUTH_LOGOUTS_TOTAL: 'auth_logouts_total',
  /** OAuth initiations */
  AUTH_OAUTH_INITIATED: 'auth_oauth_initiated_total',
  /** OAuth completions */
  AUTH_OAUTH_COMPLETED: 'auth_oauth_completed_total',
  /** Active user sessions */
  AUTH_ACTIVE_SESSIONS: 'auth_active_sessions',

  // ============= Database Metrics =============
  /** Database query duration in milliseconds */
  DB_QUERY_DURATION_MS: 'db_query_duration_ms',
  /** Database query errors */
  DB_ERRORS_TOTAL: 'db_errors_total',
  /** Database connection pool size */
  DB_CONNECTIONS_ACTIVE: 'db_connections_active',
  /** Slow queries (> 1s) */
  DB_SLOW_QUERIES_TOTAL: 'db_slow_queries_total',

  // ============= Cache Metrics =============
  /** Cache hits */
  CACHE_HITS_TOTAL: 'cache_hits_total',
  /** Cache misses */
  CACHE_MISSES_TOTAL: 'cache_misses_total',
  /** Cache evictions */
  CACHE_EVICTIONS_TOTAL: 'cache_evictions_total',

  // ============= Circuit Breaker Metrics =============
  /** Circuit breaker trip events */
  CIRCUIT_BREAKER_TRIPS: 'circuit_breaker_trips_total',
  /** Circuit breaker reset events */
  CIRCUIT_BREAKER_RESETS: 'circuit_breaker_resets_total',
  /** Current circuit breaker state */
  CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',

  // ============= Rate Limit Metrics =============
  /** Rate limit hits */
  RATE_LIMIT_HITS: 'rate_limit_hits_total',
  /** Rate limit rejections */
  RATE_LIMIT_REJECTIONS: 'rate_limit_rejections_total',

  // ============= Warmup Metrics =============
  /** Warmup emails sent */
  WARMUP_EMAILS_SENT: 'warmup_emails_sent_total',
  /** Warmup replies received */
  WARMUP_REPLIES_RECEIVED: 'warmup_replies_received_total',
  /** Active warmup mailboxes */
  WARMUP_MAILBOXES_ACTIVE: 'warmup_mailboxes_active',

  // ============= Billing Metrics =============
  /** Subscription events */
  BILLING_SUBSCRIPTIONS_CREATED: 'billing_subscriptions_created_total',
  /** Payment success */
  BILLING_PAYMENTS_SUCCESS: 'billing_payments_success_total',
  /** Payment failures */
  BILLING_PAYMENTS_FAILED: 'billing_payments_failed_total',
  /** Usage metering events */
  BILLING_USAGE_RECORDED: 'billing_usage_recorded_total',

  // ============= Webhook Metrics =============
  /** Webhook events received */
  WEBHOOKS_RECEIVED_TOTAL: 'webhooks_received_total',
  /** Webhook processing errors */
  WEBHOOKS_ERRORS_TOTAL: 'webhooks_errors_total',
  /** Webhook processing duration */
  WEBHOOK_PROCESSING_DURATION_MS: 'webhook_processing_duration_ms',

  // ============= API Metrics =============
  /** API key validations */
  API_KEY_VALIDATIONS_TOTAL: 'api_key_validations_total',
  /** Invalid API key attempts */
  API_KEY_INVALID_TOTAL: 'api_key_invalid_total',

  // ============= Mailbox Metrics =============
  /** Mailboxes provisioned */
  MAILBOXES_PROVISIONED: 'mailboxes_provisioned_total',
  /** Mailbox connection errors */
  MAILBOXES_CONNECTION_ERRORS: 'mailboxes_connection_errors_total',
  /** Active mailboxes */
  MAILBOXES_ACTIVE: 'mailboxes_active',

  // ============= Domain Metrics =============
  /** Domains registered */
  DOMAINS_REGISTERED: 'domains_registered_total',
  /** Domain verification attempts */
  DOMAINS_VERIFICATION_ATTEMPTS: 'domains_verification_attempts_total',
  /** Domain verification successes */
  DOMAINS_VERIFIED: 'domains_verified_total',
} as const

// Type for metric names
export type MetricName = (typeof METRICS)[keyof typeof METRICS]

// Common label keys for consistency
export const METRIC_LABELS = {
  METHOD: 'method',
  PATH: 'path',
  STATUS: 'status',
  STATUS_CODE: 'status_code',
  ERROR_TYPE: 'error_type',
  CAMPAIGN_ID: 'campaign_id',
  ORGANIZATION_ID: 'organization_id',
  MAILBOX_ID: 'mailbox_id',
  PROVIDER: 'provider',
  ENDPOINT: 'endpoint',
  OPERATION: 'operation',
} as const
