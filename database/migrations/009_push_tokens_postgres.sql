-- Stores Expo push tokens so the backend can send customer-facing notifications (group-buy
-- succeeded, drink ready for pickup) via the Expo push service. See docs/open-questions.md's
-- 2026-09-30 decision entry for why this is a direct backend->Expo call, not routed through n8n.
--
-- Identity is the token itself (UNIQUE(expo_push_token)), not (user_id, expo_push_token): a push
-- token belongs to a physical device/app install, not a person. If a different user later logs
-- into the same device, the upsert repoints user_id to them instead of leaving a stale duplicate
-- that would notify the wrong person.

CREATE TABLE push_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expo_push_token)
);

CREATE INDEX push_tokens_user_id_idx ON push_tokens (user_id);
