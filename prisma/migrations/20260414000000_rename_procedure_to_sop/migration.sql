-- Rename procedures table to sops
ALTER TABLE "procedures" RENAME TO "sops";

-- Rename procedureId column to sopId in executions table
ALTER TABLE "executions" RENAME COLUMN "procedureId" TO "sopId";

-- Rename the self-referential relation name (Prisma convention)
-- The relation is ProcedureHierarchy -> SopHierarchy (Prisma-level only, no SQL change needed)

-- Rename indexes (PostgreSQL auto-renames indexes on table rename, but
-- explicitly rename any named constraints for clarity)

-- Update the unique constraint
ALTER INDEX "procedures_organizationId_slug_key" RENAME TO "sops_organizationId_slug_key";

-- Update indexes
ALTER INDEX "procedures_organizationId_idx" RENAME TO "sops_organizationId_idx";
ALTER INDEX "procedures_level_idx" RENAME TO "sops_level_idx";
ALTER INDEX "procedures_maturity_idx" RENAME TO "sops_maturity_idx";
ALTER INDEX "procedures_parentEntityId_idx" RENAME TO "sops_parentEntityId_idx";

-- Update the execution index that referenced procedureId
ALTER INDEX "executions_procedureId_idx" RENAME TO "executions_sopId_idx";

-- Rename foreign key constraints
ALTER TABLE "executions" RENAME CONSTRAINT "executions_procedureId_fkey" TO "executions_sopId_fkey";
ALTER TABLE "sops" RENAME CONSTRAINT "procedures_parentEntityId_fkey" TO "sops_parentEntityId_fkey";

-- Rename primary key constraint
ALTER TABLE "sops" RENAME CONSTRAINT "procedures_pkey" TO "sops_pkey";
