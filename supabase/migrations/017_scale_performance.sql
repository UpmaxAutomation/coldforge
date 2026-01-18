-- Scale & Performance Infrastructure Tables
-- =========================================

-- Job Queue Tables
-- ----------------

-- Jobs table for persistent queue
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name VARCHAR(100) NOT NULL,
    job_name VARCHAR(100) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'failed', 'delayed')),
    priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    options JSONB DEFAULT '{}',
    result JSONB,
    error TEXT,
    process_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for job queries
CREATE INDEX idx_jobs_queue_status ON jobs(queue_name, status);
CREATE INDEX idx_jobs_status_priority ON jobs(status, priority) WHERE status = 'waiting';
CREATE INDEX idx_jobs_process_at ON jobs(process_at) WHERE status = 'delayed';
CREATE INDEX idx_jobs_workspace ON jobs(workspace_id);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);

-- Failed jobs archive
CREATE TABLE IF NOT EXISTS failed_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    queue_name VARCHAR(100) NOT NULL,
    job_name VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    error TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_failed_jobs_queue ON failed_jobs(queue_name);
CREATE INDEX idx_failed_jobs_failed_at ON failed_jobs(failed_at);

-- Rate Limiting Tables
-- --------------------

-- Rate limit counters (for database-backed rate limiting)
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(100) NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_rate_limit_unique ON rate_limit_counters(identifier, key_prefix, window_start);
CREATE INDEX idx_rate_limit_cleanup ON rate_limit_counters(window_end);

-- Performance Metrics Tables
-- --------------------------

-- Metrics aggregates (for historical metrics storage)
CREATE TABLE IF NOT EXISTS metric_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_type VARCHAR(20) NOT NULL CHECK (metric_type IN ('counter', 'gauge', 'histogram')),
    labels JSONB DEFAULT '{}',
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    count BIGINT NOT NULL DEFAULT 0,
    sum DOUBLE PRECISION,
    min DOUBLE PRECISION,
    max DOUBLE PRECISION,
    avg DOUBLE PRECISION,
    p50 DOUBLE PRECISION,
    p95 DOUBLE PRECISION,
    p99 DOUBLE PRECISION,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metrics_name_period ON metric_aggregates(metric_name, period_start);
CREATE INDEX idx_metrics_workspace ON metric_aggregates(workspace_id, period_start);

-- Slow query log
CREATE TABLE IF NOT EXISTS slow_query_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash VARCHAR(64) NOT NULL,
    query_pattern TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    calls INTEGER NOT NULL DEFAULT 1,
    total_time_ms BIGINT NOT NULL DEFAULT 0,
    avg_time_ms DOUBLE PRECISION,
    max_time_ms INTEGER,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slow_query_hash ON slow_query_log(query_hash);
CREATE INDEX idx_slow_query_duration ON slow_query_log(avg_time_ms DESC);

-- Circuit Breaker State
-- ---------------------

CREATE TABLE IF NOT EXISTS circuit_breaker_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    state VARCHAR(20) NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half-open')),
    failures INTEGER NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    last_failure TIMESTAMPTZ,
    next_retry TIMESTAMPTZ,
    config JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cache Invalidation Log
-- ----------------------

CREATE TABLE IF NOT EXISTS cache_invalidations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key VARCHAR(500) NOT NULL,
    pattern VARCHAR(500),
    reason VARCHAR(255),
    tags TEXT[],
    invalidated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cache_invalidation_key ON cache_invalidations(cache_key);
CREATE INDEX idx_cache_invalidation_tags ON cache_invalidations USING gin(tags);

-- Load Balancer Health
-- --------------------

CREATE TABLE IF NOT EXISTS server_health_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id VARCHAR(100) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    healthy BOOLEAN NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_server_health_server ON server_health_log(server_id, checked_at DESC);
CREATE INDEX idx_server_health_time ON server_health_log(checked_at);

-- Cleanup old health logs (keep 7 days)
CREATE INDEX idx_server_health_cleanup ON server_health_log(checked_at) WHERE checked_at < NOW() - INTERVAL '7 days';

-- System Status
-- -------------

CREATE TABLE IF NOT EXISTS system_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    message TEXT,
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_status_component ON system_status(component, checked_at DESC);

-- Feature Flags for Scale
-- -----------------------

CREATE TABLE IF NOT EXISTS scale_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB DEFAULT '{}',
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Insert default feature flags
INSERT INTO scale_feature_flags (name, enabled, description) VALUES
    ('redis_cache', true, 'Enable Redis caching'),
    ('job_queue', true, 'Enable background job queue'),
    ('metrics_collection', true, 'Enable metrics collection'),
    ('rate_limiting', true, 'Enable rate limiting'),
    ('circuit_breaker', true, 'Enable circuit breaker pattern'),
    ('query_caching', true, 'Enable database query caching'),
    ('cdn_integration', false, 'Enable CDN integration'),
    ('read_replicas', false, 'Enable read replica routing')
ON CONFLICT (name) DO NOTHING;

-- Functions
-- ---------

-- Function to record slow query
CREATE OR REPLACE FUNCTION record_slow_query(
    p_query TEXT,
    p_duration_ms INTEGER
)
RETURNS void AS $$
DECLARE
    v_hash VARCHAR(64);
    v_pattern TEXT;
BEGIN
    -- Generate hash of query pattern
    v_pattern := regexp_replace(p_query, '\d+', '?', 'g'); -- Replace numbers with ?
    v_pattern := regexp_replace(v_pattern, '''[^'']*''', '?', 'g'); -- Replace strings with ?
    v_hash := encode(sha256(v_pattern::bytea), 'hex');

    INSERT INTO slow_query_log (query_hash, query_pattern, duration_ms, total_time_ms, max_time_ms)
    VALUES (v_hash, v_pattern, p_duration_ms, p_duration_ms, p_duration_ms)
    ON CONFLICT (query_hash) DO UPDATE SET
        calls = slow_query_log.calls + 1,
        total_time_ms = slow_query_log.total_time_ms + EXCLUDED.duration_ms,
        avg_time_ms = (slow_query_log.total_time_ms + EXCLUDED.duration_ms)::float / (slow_query_log.calls + 1),
        max_time_ms = GREATEST(slow_query_log.max_time_ms, EXCLUDED.duration_ms),
        last_seen = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old jobs
CREATE OR REPLACE FUNCTION cleanup_old_jobs(
    p_completed_retention_days INTEGER DEFAULT 7,
    p_failed_retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM jobs
        WHERE (status = 'completed' AND completed_at < NOW() - (p_completed_retention_days || ' days')::INTERVAL)
           OR (status = 'failed' AND completed_at < NOW() - (p_failed_retention_days || ' days')::INTERVAL)
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;

    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup rate limit counters
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM rate_limit_counters
        WHERE window_end < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted FROM deleted;

    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate metrics
CREATE OR REPLACE FUNCTION aggregate_metrics(
    p_period_hours INTEGER DEFAULT 1
)
RETURNS void AS $$
BEGIN
    -- This would be called periodically to aggregate metrics
    -- Implementation depends on source metrics table
    NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to check and update circuit breaker state
CREATE OR REPLACE FUNCTION check_circuit_breaker(
    p_name VARCHAR(100),
    p_success BOOLEAN
)
RETURNS TABLE(state VARCHAR(20), should_allow BOOLEAN) AS $$
DECLARE
    v_state RECORD;
    v_threshold INTEGER := 5;
    v_reset_timeout INTEGER := 60;
BEGIN
    -- Get or create circuit breaker state
    INSERT INTO circuit_breaker_states (name)
    VALUES (p_name)
    ON CONFLICT (name) DO NOTHING;

    SELECT * INTO v_state
    FROM circuit_breaker_states
    WHERE name = p_name
    FOR UPDATE;

    IF p_success THEN
        -- Success
        UPDATE circuit_breaker_states
        SET failures = 0,
            successes = successes + 1,
            state = CASE
                WHEN state = 'half-open' AND successes >= 3 THEN 'closed'
                ELSE state
            END,
            updated_at = NOW()
        WHERE name = p_name;
    ELSE
        -- Failure
        UPDATE circuit_breaker_states
        SET failures = failures + 1,
            successes = 0,
            last_failure = NOW(),
            state = CASE
                WHEN failures >= v_threshold THEN 'open'
                WHEN state = 'half-open' THEN 'open'
                ELSE state
            END,
            next_retry = CASE
                WHEN failures >= v_threshold THEN NOW() + (v_reset_timeout || ' seconds')::INTERVAL
                ELSE next_retry
            END,
            updated_at = NOW()
        WHERE name = p_name;
    END IF;

    -- Return current state
    RETURN QUERY
    SELECT cb.state,
           CASE
               WHEN cb.state = 'closed' THEN true
               WHEN cb.state = 'open' AND cb.next_retry <= NOW() THEN true
               WHEN cb.state = 'half-open' THEN true
               ELSE false
           END AS should_allow
    FROM circuit_breaker_states cb
    WHERE cb.name = p_name;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_queue_waiting ON jobs(queue_name, priority)
    WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_jobs_delayed_process ON jobs(process_at)
    WHERE status = 'delayed' AND process_at IS NOT NULL;

-- Enable RLS on new tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_invalidations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their workspace jobs"
    ON jobs FOR SELECT
    USING (
        workspace_id IS NULL
        OR workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view their workspace metrics"
    ON metric_aggregates FOR SELECT
    USING (
        workspace_id IS NULL
        OR workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- Triggers
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_circuit_breaker_updated_at
    BEFORE UPDATE ON circuit_breaker_states
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE jobs IS 'Background job queue for async processing';
COMMENT ON TABLE metric_aggregates IS 'Aggregated performance metrics for historical analysis';
COMMENT ON TABLE slow_query_log IS 'Log of slow database queries for optimization';
COMMENT ON TABLE circuit_breaker_states IS 'State tracking for circuit breaker pattern';
COMMENT ON TABLE cache_invalidations IS 'Audit log of cache invalidation operations';
COMMENT ON TABLE server_health_log IS 'Health check logs for load balanced servers';
COMMENT ON TABLE scale_feature_flags IS 'Feature flags for scale infrastructure';
