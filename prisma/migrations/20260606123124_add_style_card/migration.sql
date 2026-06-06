-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "genre" TEXT[],
    "targetWordCount" INTEGER NOT NULL DEFAULT 100000,
    "synopsis" TEXT NOT NULL DEFAULT '',
    "toneKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "povCharacterId" TEXT,
    "llmConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "age" TEXT NOT NULL DEFAULT '未知',
    "gender" TEXT NOT NULL DEFAULT '未知',
    "role" TEXT NOT NULL DEFAULT 'supporting',
    "appearance" JSONB NOT NULL DEFAULT '{}',
    "personality" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dialogueStyle" JSONB NOT NULL DEFAULT '{}',
    "background" TEXT NOT NULL DEFAULT '',
    "hiddenMotives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relationships" JSONB NOT NULL DEFAULT '[]',
    "currentStatus" TEXT NOT NULL DEFAULT 'alive',
    "arcProgress" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LorebookEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "keys" TEXT[],
    "content" TEXT NOT NULL,
    "insertionOrder" INTEGER NOT NULL DEFAULT 50,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "relatedEntryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LorebookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'outline_only',
    "outline" TEXT,
    "content" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "branchId" TEXT,
    "isMainBranch" BOOLEAN NOT NULL DEFAULT true,
    "previousVersionId" TEXT,
    "activeCharacters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activeLoreIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coreConflict" TEXT,
    "settingDescription" TEXT,
    "notes" TEXT,
    "reviewLogs" JSONB NOT NULL DEFAULT '[]',
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryBranch" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "parentBranchId" TEXT,
    "forkPointNodeId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterSummary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterTitle" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "characterStates" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryBeat" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "impact" TEXT NOT NULL DEFAULT 'minor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryBeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleCard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "avgSentenceLength" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "shortSentenceRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "longSentenceRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "dialogueRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "descriptionRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "actionRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "innerThoughtRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "povType" TEXT NOT NULL DEFAULT 'third_person_limited',
    "narrativeDistance" TEXT NOT NULL DEFAULT 'medium',
    "tonalMarkers" JSONB NOT NULL DEFAULT '{}',
    "lexicalFeatures" JSONB NOT NULL DEFAULT '{}',
    "styleDescription" TEXT NOT NULL DEFAULT '',
    "sampleText" TEXT,
    "sourceChapterCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterCard_projectId_idx" ON "CharacterCard"("projectId");

-- CreateIndex
CREATE INDEX "LorebookEntry_projectId_idx" ON "LorebookEntry"("projectId");

-- CreateIndex
CREATE INDEX "LorebookEntry_enabled_idx" ON "LorebookEntry"("enabled");

-- CreateIndex
CREATE INDEX "StoryNode_projectId_idx" ON "StoryNode"("projectId");

-- CreateIndex
CREATE INDEX "StoryNode_parentId_idx" ON "StoryNode"("parentId");

-- CreateIndex
CREATE INDEX "StoryNode_branchId_idx" ON "StoryNode"("branchId");

-- CreateIndex
CREATE INDEX "StoryBranch_projectId_idx" ON "StoryBranch"("projectId");

-- CreateIndex
CREATE INDEX "ChapterSummary_projectId_idx" ON "ChapterSummary"("projectId");

-- CreateIndex
CREATE INDEX "ChapterSummary_chapterId_idx" ON "ChapterSummary"("chapterId");

-- CreateIndex
CREATE INDEX "StoryBeat_projectId_idx" ON "StoryBeat"("projectId");

-- CreateIndex
CREATE INDEX "StyleCard_projectId_idx" ON "StyleCard"("projectId");

-- AddForeignKey
ALTER TABLE "CharacterCard" ADD CONSTRAINT "CharacterCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LorebookEntry" ADD CONSTRAINT "LorebookEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryNode" ADD CONSTRAINT "StoryNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryNode" ADD CONSTRAINT "StoryNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StoryNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryNode" ADD CONSTRAINT "StoryNode_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "StoryBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBranch" ADD CONSTRAINT "StoryBranch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryBeat" ADD CONSTRAINT "StoryBeat_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
