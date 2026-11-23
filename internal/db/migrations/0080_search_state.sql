-- phase: expand
-- SPDX-License-Identifier: Apache-2.0
-- Which text of documents search holds, so a release that reads more from a document can bring
-- the entries written before it up to date once (spec 087, wave SR3). One row. text_version 1
-- is the text every entry held before this release; the worker raises it when a pass is
-- through, and the cursor and counts say where a pass stands across its runs. An installation
-- without entries holds no old text, so it starts at the text of this release. The previous
-- release reads none of it, so it keeps working beside this one. Like every migration since 0049,
-- it may run twice.

CREATE TABLE IF NOT EXISTS search_state (
    id                 bool PRIMARY KEY DEFAULT true CHECK (id),
    text_version       integer NOT NULL DEFAULT 1,
    text_cursor        uuid,
    entries_read       bigint NOT NULL DEFAULT 0,
    entries_rewritten  bigint NOT NULL DEFAULT 0,
    refreshed_at       timestamptz
);
INSERT INTO search_state (id, text_version)
SELECT true, CASE WHEN EXISTS (SELECT 1 FROM search_documents) THEN 1 ELSE 2 END
ON CONFLICT (id) DO NOTHING;
