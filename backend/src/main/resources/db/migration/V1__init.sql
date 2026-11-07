-- Flyway V1: Database schema initialization matching JPA entities and Contract v1.3

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    user_id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    account_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- 2. Devices
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(16) NOT NULL,
    status VARCHAR(32) NOT NULL,
    mode VARCHAR(16) NOT NULL,
    room_id VARCHAR(64),
    fw_version VARCHAR(32),
    online BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    light1 VARCHAR(8) DEFAULT 'OFF',
    fan1 VARCHAR(8) DEFAULT 'OFF',
    buzzer1 VARCHAR(8) DEFAULT 'OFF',
    door1 VARCHAR(8) DEFAULT 'CLOSED',
    empty_since TIMESTAMP WITH TIME ZONE,
    door_open_since TIMESTAMP WITH TIME ZONE,
    invalid_streak INTEGER NOT NULL DEFAULT 0,
    valid_streak INTEGER NOT NULL DEFAULT 0
);

-- 3. Telemetry (Node A)
CREATE TABLE IF NOT EXISTS telemetry (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    device_ts TIMESTAMP WITH TIME ZONE,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    lux DOUBLE PRECISION,
    presence BOOLEAN,
    quality VARCHAR(16) NOT NULL DEFAULT 'VALID',
    air_raw INTEGER,
    distance_cm INTEGER,
    moving_energy INTEGER,
    static_energy INTEGER,
    rssi INTEGER
);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry (device_id, received_at);

-- 4. Power Reading (Node B)
CREATE TABLE IF NOT EXISTS power_reading (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    bus_voltage_v DOUBLE PRECISION,
    light1_power_w DOUBLE PRECISION,
    light1_current_ma INTEGER,
    fan1_power_w DOUBLE PRECISION,
    fan1_current_ma INTEGER,
    quality VARCHAR(16) NOT NULL DEFAULT 'VALID',
    rssi INTEGER
);

CREATE INDEX IF NOT EXISTS idx_power_device_time ON power_reading (device_id, received_at);

-- 5. Commands
CREATE TABLE IF NOT EXISTS commands (
    id BIGSERIAL PRIMARY KEY,
    command_id VARCHAR(32) UNIQUE,
    device_id VARCHAR(64) NOT NULL,
    target VARCHAR(16) NOT NULL,
    action VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL,
    issued_by VARCHAR(64) NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ack_at TIMESTAMP WITH TIME ZONE,
    latency_ms BIGINT,
    idempotency_key VARCHAR(64) UNIQUE,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    retries INTEGER NOT NULL DEFAULT 0,
    message VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_command_device_time ON commands (device_id, issued_at);

-- 6. Alerts
CREATE TABLE IF NOT EXISTS alerts (
    alert_id BIGSERIAL PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    room_id VARCHAR(64),
    alert_value DOUBLE PRECISION,
    threshold_value DOUBLE PRECISION,
    message VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    acknowledged_by BIGINT,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_alert_status_time ON alerts (status, created_at);
CREATE INDEX IF NOT EXISTS idx_alert_device_type ON alerts (device_id, type);

-- 7. Rules
CREATE TABLE IF NOT EXISTS rules (
    rule_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    params_json TEXT,
    action_json TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 8. Device Configs
CREATE TABLE IF NOT EXISTS device_configs (
    id BIGSERIAL PRIMARY KEY,
    config_id VARCHAR(32) UNIQUE,
    device_id VARCHAR(64) NOT NULL,
    payload_json TEXT,
    status VARCHAR(16) NOT NULL,
    issued_by VARCHAR(64),
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ack_at TIMESTAMP WITH TIME ZONE,
    last_sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_config_device_time ON device_configs (device_id, issued_at);

-- 9. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    action VARCHAR(64) NOT NULL,
    target VARCHAR(128),
    result VARCHAR(64),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL
);

