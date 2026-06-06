/*
  Warnings:

  - The `personality` column on the `CharacterCard` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "CharacterCard" DROP COLUMN "personality",
ADD COLUMN     "personality" JSONB NOT NULL DEFAULT '[]';
