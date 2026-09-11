-- server/database/schema.sql

DROP TABLE IF EXISTS lead_activities;
DROP TABLE IF EXISTS leads;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS influencers;
DROP TABLE IF EXISTS brands;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE agencies (
    id SERIAL PRIMARY KEY,
    agency_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(100),
    website TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE brands (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    username VARCHAR(255),
    instagram_url TEXT,
    display_name VARCHAR(255),
    followers BIGINT,
    followers_formatted VARCHAR(100),
    following BIGINT,
    following_formatted VARCHAR(100),
    posts BIGINT,
    posts_formatted VARCHAR(100),
    snippet TEXT,
    source_query TEXT,
    source_url TEXT,
    first_seen TIMESTAMP,
    script TEXT,
    status VARCHAR(100) DEFAULT 'New',
    message_received TEXT,
    status_timestamp TIMESTAMP,
    is_archived BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brands_instagram_url ON brands (instagram_url);
CREATE INDEX IF NOT EXISTS idx_brands_username ON brands (username);
CREATE INDEX IF NOT EXISTS idx_brands_status ON brands (status);

CREATE TABLE influencers (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    influencer_name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    lead_by VARCHAR(255),
    content_why_this_person TEXT,
    instagram_url TEXT,
    followers VARCHAR(100),
    script TEXT,
    comment_average VARCHAR(100),
    send_date DATE,
    is_archived BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE leads (
    id SERIAL PRIMARY KEY,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
    brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
    influencer_id INTEGER REFERENCES influencers(id) ON DELETE CASCADE,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(100) NOT NULL DEFAULT 'Not Contacted',
    temperature VARCHAR(50) DEFAULT 'None',
    notes TEXT,
    next_follow_up_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_archived BOOLEAN DEFAULT FALSE NOT NULL,
    CONSTRAINT check_lead_type CHECK (
        (brand_id IS NOT NULL AND influencer_id IS NULL) OR
        (brand_id IS NULL AND influencer_id IS NOT NULL)
    )
);

CREATE TABLE lead_activities (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    username VARCHAR(255) NOT NULL,
    activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('Outreach', 'Call', 'WhatsApp', 'Email', 'Instagram', 'Note', 'Follow-up', 'Status Change', 'Assignment')),
    details TEXT,
    notes TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    record_type VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    record_name VARCHAR(255),
    field_changed VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE instagram_follow_ups (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    instagram_username VARCHAR(255) NOT NULL,
    message_snippet TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Unread',
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    handled_at TIMESTAMP
);
