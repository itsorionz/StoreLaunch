-- Rename ProductOwner role to SuperAdmin in the Role enum
ALTER TYPE "Role" RENAME VALUE 'ProductOwner' TO 'SuperAdmin';
