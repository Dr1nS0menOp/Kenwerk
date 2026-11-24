-- phase: expand
-- SPDX-License-Identifier: Apache-2.0
-- rbac_role_for makes a role when no role holds a set of permissions yet. Two transactions
-- that needed the same new set both made one, under the same next free name, and the second
-- failed on roles_name_key: on a fresh installation, people created in parallel failed with
-- an internal error (wave LT2, found by the load smoke test in CI). Now the making waits on
-- a lock per scope, and looks again once it holds it, so the second takes the first's role.
-- Finding an existing role takes no lock. The previous release calls the same function with
-- the same arguments, so it keeps working beside this one. Like every migration since 0049,
-- it may run twice.

-- rbac_existing_role_for is the role of a scope that holds exactly the sorted set wanted,
-- built-in roles first, then the oldest; NULL when there is none.
CREATE OR REPLACE FUNCTION rbac_existing_role_for(sc text, wanted text[]) RETURNS uuid LANGUAGE sql AS $$
    SELECT id FROM roles
    WHERE scope = sc AND ARRAY(SELECT DISTINCT p FROM unnest(permissions) p ORDER BY 1) = wanted
    ORDER BY builtin IS NULL, created_at, id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION rbac_role_for(sc text, perms text[]) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    wanted text[] := ARRAY(SELECT DISTINCT p FROM unnest(perms) p ORDER BY 1);
    found uuid;
BEGIN
    found := rbac_existing_role_for(sc, wanted);
    IF found IS NOT NULL THEN
        RETURN found;
    END IF;
    -- Held to the end of the transaction, so a second maker waits until this role is
    -- committed and then finds it.
    PERFORM pg_advisory_xact_lock(hashtext('rbac_role_for ' || sc));
    found := rbac_existing_role_for(sc, wanted);
    IF found IS NOT NULL THEN
        RETURN found;
    END IF;
    found := rbac_uuid7();
    INSERT INTO roles (id, scope, name, description, permissions)
        VALUES (found, sc, rbac_free_unnamed_name(sc, cardinality(wanted)),
                'Made from permissions that were given one by one.', wanted);
    RETURN found;
END $$;
