-- phase: expand
-- SPDX-License-Identifier: Apache-2.0
-- Wave ML1: the mail server a system administrator sets in the administration (spec 098). One
-- row; the password is sealed with the envelope keys, so a copy of the database holds only
-- ciphertext. Who changed it is in the audit log, not here. The previous release reads nothing
-- of it, so both run together. Like every migration since 0049 it may run twice.
CREATE TABLE IF NOT EXISTS mail_server (
    id              boolean PRIMARY KEY DEFAULT true CHECK (id),
    host            text NOT NULL DEFAULT '',
    port            integer NOT NULL DEFAULT 587 CHECK (port BETWEEN 1 AND 65535),
    tls             text NOT NULL DEFAULT 'starttls' CHECK (tls IN ('starttls', 'implicit', 'none')),
    username        text NOT NULL DEFAULT '',
    password_sealed bytea,
    from_address    text NOT NULL DEFAULT '',
    from_name       text NOT NULL DEFAULT '',
    reply_to        text NOT NULL DEFAULT '',
    updated_at      timestamptz NOT NULL DEFAULT now()
);
