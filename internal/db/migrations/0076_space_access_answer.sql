-- phase: expand
-- SPDX-License-Identifier: Apache-2.0
-- Spec 094: what a person without access sees, chosen per space, and one list of every key a
-- space holds. It may run twice, as every migration since 0049 may.
--
-- access_answer: not_found, no_access or no_access_ask. Every existing space starts at not_found,
-- and one that offered requests for access (the feature access_requests) at no_access_ask, so
-- nothing is shown after the upgrade that its administrators did not choose. A space made
-- afterwards starts at no_access_ask (D11). The previous release reads the feature rows, which
-- the new release keeps in step, and never this column.
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS access_answer text NOT NULL DEFAULT 'not_found';
ALTER TABLE spaces DROP CONSTRAINT IF EXISTS spaces_access_answer_known;
ALTER TABLE spaces ADD CONSTRAINT spaces_access_answer_known
    CHECK (access_answer IN ('not_found', 'no_access', 'no_access_ask')) NOT VALID;
ALTER TABLE spaces VALIDATE CONSTRAINT spaces_access_answer_known;
UPDATE spaces s SET access_answer = 'no_access_ask'
    FROM space_features f
    WHERE f.space_id = s.id AND f.feature = 'access_requests' AND f.enabled AND s.access_answer = 'not_found';
ALTER TABLE spaces ALTER COLUMN access_answer SET DEFAULT 'no_access_ask';

-- space_key_claims holds every key a space holds, current and old, in lower case, so one key
-- belongs to one space whichever table holds it, even when a change of key and a new space
-- run at the same moment. Triggers keep it: a key is claimed when a space or an old key takes
-- it, and let go when neither holds it any more. A claim of a key another space holds fails
-- as a unique violation, which the spaces module answers as key_taken.
CREATE TABLE IF NOT EXISTS space_key_claims (
    key      text PRIMARY KEY,
    space_id uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS space_key_claims_space ON space_key_claims (space_id);
INSERT INTO space_key_claims (key, space_id) SELECT lower(key), id FROM spaces ON CONFLICT DO NOTHING;
-- An old key that is also another space's current key keeps its row but no claim: every lookup
-- finds the current key first, and the row only lists it in its space's settings.
INSERT INTO space_key_claims (key, space_id) SELECT alias, space_id FROM space_key_aliases ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION claim_space_key(claimed text, claimant uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO space_key_claims (key, space_id) VALUES (lower(claimed), claimant) ON CONFLICT (key) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM space_key_claims WHERE key = lower(claimed) AND space_id = claimant) THEN
        RAISE EXCEPTION 'this key is held by another space' USING ERRCODE = 'unique_violation';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION release_space_key(released text, holder uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM space_key_claims c WHERE c.key = lower(released) AND c.space_id = holder
        AND NOT EXISTS (SELECT 1 FROM spaces s WHERE s.id = holder AND lower(s.key) = lower(released))
        AND NOT EXISTS (SELECT 1 FROM space_key_aliases a WHERE a.space_id = holder AND a.alias = lower(released));
END $$;

CREATE OR REPLACE FUNCTION spaces_claim_key() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM claim_space_key(NEW.key, NEW.id);
    ELSIF lower(NEW.key) <> lower(OLD.key) THEN
        PERFORM claim_space_key(NEW.key, NEW.id);
        PERFORM release_space_key(OLD.key, OLD.id);
    END IF;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION space_key_aliases_claim_key() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM claim_space_key(NEW.alias, NEW.space_id);
    ELSE
        PERFORM release_space_key(OLD.alias, OLD.space_id);
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS spaces_claim_key ON spaces;
CREATE TRIGGER spaces_claim_key AFTER INSERT OR UPDATE OF key ON spaces
    FOR EACH ROW EXECUTE FUNCTION spaces_claim_key();
DROP TRIGGER IF EXISTS space_key_aliases_claim_key ON space_key_aliases;
CREATE TRIGGER space_key_aliases_claim_key AFTER INSERT OR DELETE ON space_key_aliases
    FOR EACH ROW EXECUTE FUNCTION space_key_aliases_claim_key();
