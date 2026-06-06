-- AlterTable
ALTER TABLE "CharacterCard" ADD COLUMN     "abilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
