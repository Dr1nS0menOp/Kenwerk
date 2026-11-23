-- phase: expand
-- SPDX-License-Identifier: Apache-2.0
-- Wave ST1: the outside services a system administrator sets in the administration (spec 101):
-- the identity provider, the PDF helper, the office service, the drawing service and the token
-- of the metrics scraper. One row; the client secret, the PDF password and the metrics token are
-- sealed with the envelope keys, so a copy of the database holds only ciphertext. Who changed it
-- is in the audit log, not here. The previous release reads nothing of it, so both run together.
-- Like every migration since 0049 it may run twice.
CREATE TABLE IF NOT EXISTS connections (
    id                          boolean PRIMARY KEY DEFAULT true CHECK (id),
    oidc_issuer                 text NOT NULL DEFAULT '',
    oidc_client_id              text NOT NULL DEFAULT '',
    oidc_client_secret_sealed   bytea,
    oidc_display_name           text NOT NULL DEFAULT '',
    oidc_auto_create            boolean NOT NULL DEFAULT false,
    oidc_allow_unverified_email boolean NOT NULL DEFAULT false,
    oidc_groups_claim           text NOT NULL DEFAULT '',
    pdf_url                     text NOT NULL DEFAULT '',
    pdf_password_sealed         bytea,
    collabora_url               text NOT NULL DEFAULT '',
    drawing_url                 text NOT NULL DEFAULT '',
    metrics_token_sealed        bytea,
    updated_at                  timestamptz NOT NULL DEFAULT now()
);
