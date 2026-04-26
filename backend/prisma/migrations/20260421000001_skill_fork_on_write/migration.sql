-- AlterTable: Add fork-on-write columns to skills
ALTER TABLE "skills" ADD COLUMN "parent_skill_id" UUID;
ALTER TABLE "skills" ADD COLUMN "owner_scope_id" UUID;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_parent_skill_id_fkey" FOREIGN KEY ("parent_skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "skills_parent_skill_id_idx" ON "skills"("parent_skill_id");
CREATE INDEX "skills_owner_scope_id_idx" ON "skills"("owner_scope_id");
