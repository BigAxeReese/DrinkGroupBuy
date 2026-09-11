-- Adds merchant self-service application support. This is the first table in this project
-- with any runtime (not one-time-seed) path that results in new merchants/stores/merchant_users/
-- user_roles rows -- see backend/merchants/merchantApplicationService.js for the approval flow.
--
-- Deliberately does not store latitude/longitude here: per product decision, the application
-- only collects a free-text address, and the admin enters coordinates manually at approval time
-- directly into stores.latitude/longitude (no geocoding integration in this version).

CREATE TABLE merchant_applications (
  id text PRIMARY KEY,
  applicant_firebase_uid text NOT NULL,
  applicant_email text,
  applicant_display_name text,
  contact_phone text NOT NULL,
  store_name text NOT NULL,
  address text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_user_id text REFERENCES users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  resulting_merchant_id text REFERENCES merchants(id),
  resulting_store_id text REFERENCES stores(id),
  resulting_user_id text REFERENCES users(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX idx_merchant_applications_status ON merchant_applications(status, created_at DESC);

-- Same purpose as idx_refund_requests_pending_per_capture (004): the concurrency-safe way to
-- stop the same applicant double-submitting while one application is still pending, enforced by
-- the database rather than a separate lookup-then-insert check that a race could slip past.
CREATE UNIQUE INDEX idx_merchant_applications_pending_per_applicant
ON merchant_applications(applicant_firebase_uid)
WHERE status = 'pending';
