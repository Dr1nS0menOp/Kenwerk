-- phase: expand
-- SPDX-License-Identifier: Apache-2.0
-- A credential with limits (spec 096, wave MC2). A personal access token may be limited to
-- some spaces and marked as one an assistant uses. Both columns are new and the previous
-- release reads neither, so it keeps working beside this one.
ALTER TABLE api_tokens
    ADD COLUMN IF NOT EXISTS space_ids uuid[],
    ADD COLUMN IF NOT EXISTS assistant boolean NOT NULL DEFAULT false;

ALTER TABLE api_tokens DROP CONSTRAINT IF EXISTS api_tokens_space_ids_check;
-- NOT VALID: every row already there has no limit, so there is nothing to read under the lock;
-- new and changed rows are checked from now on.
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_space_ids_check
    CHECK (space_ids IS NULL OR cardinality(space_ids) BETWEEN 1 AND 50) NOT VALID;

-- The lists that hand out what a person reaches gain the spaces a credential is limited to:
-- NULL is every space, as before. The body lives in the new signature only, and the old one
-- asks it with NULL, so both always give the same answer and the previous release, which calls
-- the old one, sees no change. The old signatures go in a contract migration a release later.
-- The functions that only list what to leave out (hidden pages, unpinned files, pages hidden
-- by document control) need no limit: what they leave out is outside the limit or not.
CREATE OR REPLACE FUNCTION perm_spaces(u uuid, p text, allowed uuid[]) RETURNS TABLE (space_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT DISTINCT g.space_id
    FROM users x
    JOIN space_grants g ON g.permission = p AND (
           (g.subject_type = 'user' AND g.subject_id = x.id)
        OR (g.subject_type = 'group' AND g.subject_id IN
               (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = x.id))
        OR (g.subject_type = 'all_members' AND x.type = 'member')
        OR (g.subject_type = 'all_guests' AND x.type = 'guest'))
    JOIN spaces s ON s.id = g.space_id AND s.status <> 'trashed'
    WHERE x.id = u AND x.status = 'active' AND (x.expires_at IS NULL OR x.expires_at > now())
      AND perm_has_global(u, 'use_product')
      AND (allowed IS NULL OR g.space_id = ANY (allowed))
$$;

CREATE OR REPLACE FUNCTION perm_spaces(u uuid, p text) RETURNS TABLE (space_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT ps.space_id FROM perm_spaces(u, p, NULL) ps
$$;

CREATE OR REPLACE FUNCTION perm_visible_pages(u uuid, allowed uuid[]) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT p.id
    FROM pages p
    WHERE p.space_id IN (SELECT ps.space_id FROM perm_spaces(u, 'space.view', allowed) ps)
      AND (p.status = 'published' OR (p.status = 'draft' AND p.created_by = u))
      AND p.kind <> 'template'
      AND p.id NOT IN (SELECT h.page_id FROM perm_hidden_pages(u) h)
      AND p.id NOT IN (SELECT c.page_id FROM perm_control_hidden_pages(u) c)
$$;

CREATE OR REPLACE FUNCTION perm_visible_pages(u uuid) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT v.page_id FROM perm_visible_pages(u, NULL) v
$$;

CREATE OR REPLACE FUNCTION perm_listed_pages(u uuid, allowed uuid[]) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT p.id
    FROM pages p
    WHERE p.space_id IN (SELECT ps.space_id FROM perm_spaces(u, 'space.view', allowed) ps)
      AND (p.status = 'published' OR (p.status = 'draft' AND p.created_by = u))
      AND p.kind <> 'template'
      AND p.archived_at IS NULL
      AND p.id NOT IN (SELECT h.page_id FROM perm_hidden_pages(u) h)
      AND p.id NOT IN (SELECT c.page_id FROM perm_control_hidden_pages(u) c)
$$;

CREATE OR REPLACE FUNCTION perm_listed_pages(u uuid) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT l.page_id FROM perm_listed_pages(u, NULL) l
$$;

CREATE OR REPLACE FUNCTION perm_editable_pages(u uuid, allowed uuid[]) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT v.page_id
    FROM perm_visible_pages(u, allowed) v
    JOIN pages p ON p.id = v.page_id
    JOIN spaces s ON s.id = p.space_id
    WHERE s.status = 'active' AND p.archived_at IS NULL
      AND s.pair_role IS DISTINCT FROM 'published'
      AND CASE WHEN p.kind = 'database'
            THEN p.space_id IN (SELECT e.space_id FROM perm_spaces(u, 'database.edit') e)
            ELSE p.space_id IN (SELECT e.space_id FROM perm_spaces(u, 'page.edit') e) END
      AND p.id NOT IN (
        SELECT r.page_id
        FROM page_restrictions r
        WHERE r.kind = 'edit'
        GROUP BY r.page_id
        HAVING NOT bool_or(
               (r.subject_type = 'user' AND r.subject_id = u)
            OR (r.subject_type = 'group' AND r.subject_id IN
                   (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = u))))
$$;

CREATE OR REPLACE FUNCTION perm_editable_pages(u uuid) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT e.page_id FROM perm_editable_pages(u, NULL) e
$$;

CREATE OR REPLACE FUNCTION perm_visible_comments(u uuid, allowed uuid[]) RETURNS TABLE (comment_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT c.id
    FROM comments c
    JOIN perm_visible_pages(u, allowed) v ON v.page_id = c.page_id
    WHERE c.trash_item_id IS NULL AND NOT c.purged
      AND (NOT c.editors_only OR c.page_id IN (SELECT e.page_id FROM perm_editable_pages(u, allowed) e))
$$;

CREATE OR REPLACE FUNCTION perm_visible_comments(u uuid) RETURNS TABLE (comment_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT c.comment_id FROM perm_visible_comments(u, NULL) c
$$;

CREATE OR REPLACE FUNCTION perm_review_pages(u uuid, allowed uuid[]) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT r.page_id
    FROM workflow_reviewers wr
    JOIN workflow_rounds r ON r.id = wr.round_id AND r.status = 'open' AND r.review_stage = wr.stage
    JOIN page_control pc ON pc.page_id = r.page_id AND pc.state_id = wr.state_id
    JOIN pages p ON p.id = r.page_id AND p.status <> 'trashed' AND p.kind <> 'template'
    JOIN users x ON x.id = wr.user_id AND x.type = 'member'
    WHERE wr.user_id = u AND wr.removed_at IS NULL
      AND p.space_id IN (SELECT ps.space_id FROM perm_spaces(u, 'space.view', allowed) ps)
$$;

CREATE OR REPLACE FUNCTION perm_review_pages(u uuid) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT r.page_id FROM perm_review_pages(u, NULL) r
$$;

-- A template of the instance is no space's, so a credential limited to spaces gets no notice
-- of one.
CREATE OR REPLACE FUNCTION perm_template_notice_pages(u uuid, allowed uuid[]) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT t.page_id
    FROM templates t
    WHERE (allowed IS NULL OR t.space_id = ANY (allowed))
      AND (t.owner_id = u
       OR ((CASE WHEN t.space_id IS NULL THEN perm_has_global(u, 'administrator')
                 ELSE t.space_id IN (SELECT ps.space_id FROM perm_spaces(u, 'space.templates') ps) END)
           AND (NOT EXISTS (SELECT 1 FROM template_rights r WHERE r.template_id = t.id AND r.kind = 'edit')
                OR EXISTS (SELECT 1 FROM template_rights r WHERE r.template_id = t.id AND r.kind = 'edit'
                    AND ((r.subject_type = 'user' AND r.subject_id = u)
                      OR (r.subject_type = 'group' AND r.subject_id IN
                          (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = u)))))))
$$;

CREATE OR REPLACE FUNCTION perm_template_notice_pages(u uuid) RETURNS TABLE (page_id uuid)
    LANGUAGE sql STABLE AS $$
    SELECT n.page_id FROM perm_template_notice_pages(u, NULL) n
$$;
