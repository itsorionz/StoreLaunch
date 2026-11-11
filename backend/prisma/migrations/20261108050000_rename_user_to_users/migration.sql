-- Rename "User" -> "Users" to match the plural naming of "Roles" / "UserRoles".
-- Renaming a table does NOT rename its constraints or indexes, so each one is
-- renamed explicitly (PK/unique constraint renames also carry their backing
-- index; the loops below pick up anything left over).

ALTER TABLE "User" RENAME TO "Users";

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = '"Users"'::regclass
      AND conname LIKE 'User\_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE "Users" RENAME CONSTRAINT %I TO %I',
      rec.conname,
      replace(rec.conname, 'User_', 'Users_')
    );
  END LOOP;

  FOR rec IN
    SELECT i.relname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    WHERE x.indrelid = '"Users"'::regclass
      AND i.relname LIKE 'User\_%'
  LOOP
    EXECUTE format(
      'ALTER INDEX %I RENAME TO %I',
      rec.relname,
      replace(rec.relname, 'User_', 'Users_')
    );
  END LOOP;
END $$;
