-- Phase 1: L1.8 - Seed data(scope definitions + rate limits)

INSERT INTO scope_definitions(scope,description,is_delegable,risk_level)VALUES
('dm:create','Create direct messages',true,'medium'),
('dm:read','Read own direct messages',true,'low'),
('dm:read:all','Read all DMs(admin)',false,'critical'),
('media:upload','Upload media files',true,'medium'),
('calls:initiate','Start voice/video calls',true,'high'),
('calls:answer','Answer incoming calls',true,'medium'),
('presence:read','Read user online status',true,'low'),
('profile:update','Update own profile',true,'low'),
('admin:users','Manage users',false,'critical'),
('admin:content','Content moderation',false,'critical'),
('system:impersonate','Impersonate users',false,'critical')
ON CONFLICT(scope)DO NOTHING;

INSERT INTO rate_limit_configs(scope,tier,action,algorithm,limit_value,window_seconds,burst)VALUES
('global','A','token:issue','fixed_window',100,3600,120),
('global','B','token:issue','fixed_window',30,3600,40),
('global','C','token:issue','fixed_window',10,3600,15),
('global','D','token:issue','fixed_window',3,3600,5),
('global','A','dm:create','token_bucket',100,60,120),
('global','B','dm:create','token_bucket',30,60,40),
('global','C','dm:create','token_bucket',10,60,15),
('global','D','dm:create','token_bucket',3,60,5),
('global','A','media:upload','token_bucket',50,60,60),
('global','B','media:upload','token_bucket',20,60,25),
('global','C','media:upload','token_bucket',5,60,8),
('global','D','media:upload','token_bucket',1,60,2)
ON CONFLICT(scope,tier,action)DO NOTHING;

COMMENT ON TABLE scope_definitions IS'Phase 1 SSOT for delegable scopes with risk classification';
COMMENT ON TABLE rate_limit_configs IS'Phase 1 tiered rate limiting:A(trusted)B(default)C(restricted)D(high-risk)';