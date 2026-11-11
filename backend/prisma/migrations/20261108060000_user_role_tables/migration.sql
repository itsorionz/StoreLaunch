-- CreateTable
CREATE TABLE "Roles" (
    "id" TEXT NOT NULL,
    "name" "Role" NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT "UserRoles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Roles_name_key" ON "Roles"("name");

-- CreateIndex
CREATE INDEX "UserRoles_roleId_idx" ON "UserRoles"("roleId");

-- AddForeignKey
ALTER TABLE "UserRoles" ADD CONSTRAINT "UserRoles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoles" ADD CONSTRAINT "UserRoles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed role rows and backfill assignments from User.roles array for compatibility.
INSERT INTO "Roles" ("id", "name", "label", "updatedAt")
VALUES
  ('role_customer', 'Customer', 'Customer', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')),
  ('role_admin', 'Admin', 'Admin', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')),
  ('role_rider', 'Rider', 'Rider', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')),
  ('role_support', 'Support', 'Support', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')),
  ('role_warehouse', 'Warehouse', 'Warehouse', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')),
  ('role_sales', 'Sales', 'Sales', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')),
  ('role_manager', 'Manager', 'Manager', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
ON CONFLICT ("name") DO UPDATE SET "label" = EXCLUDED."label", "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "UserRoles" ("userId", "roleId")
SELECT u."id", r."id"
FROM "Users" u
JOIN unnest(u."roles") AS role_name ON TRUE
JOIN "Roles" r ON r."name" = role_name
ON CONFLICT ("userId", "roleId") DO NOTHING;
