# 前端 Pinia Store 完整结构

## 一、核心 Store

### 1. editorStore — 编辑器/正文写作状态

**State:**

| 字段名 | 类型 | 用途 |
|--------|------|------|
| currentChapterId | number \| null | 当前正在编辑的章节数据库ID |
| currentOutlineNodeId | number \| null | 当前打开的大纲节点ID |
| currentTitle | string | 当前章节标题 |
| currentContent | string | 当前章节正文内容（编辑器内实时内容） |
| currentStatus | 'pending' \| 'writing' \| 'complete' | 当前章节状态 |
| isDirty | boolean | 是否有未保存的更改 |
| lastSavedAt | string \| null | 上次保存时间戳 |
| editorMode | 'edit' \| 'preview' \| 'split' | 编辑器模式 |
| wordCount | number | 当前章节字数统计 |
| isGenerating | boolean | 是否正在由AI生成正文 |
| generationStream | string | AI生成内容的流式缓冲区 |
| autoSaveTimer | number \| null | 自动保存定时器ID |
| contentHistory | string[] | 内容撤销历史栈 |
| historyIndex | number | 当前在历史栈中的位置 |

**Actions:** openChapter(outlineNodeId), closeChapter(), updateContent(content), saveChapter(), autoSave(), setEditorMode(mode), undo(), redo(), startGeneration(), appendGenerationStream(text), finishGeneration(accepted), resetEditor()

**Getters:** hasUnsavedChanges, chapterExists, currentChapterInfo, canUndo, canRedo

### 2. projectStore — 项目级元信息

**State:** projectId, projectName, projectDescription, genre, authorName, coverUrl, totalWordCount, chapterCount, volumeCount, createdAt, updatedAt, projectStatus('draft'\|'writing'\|'completed'\|'published')

**Actions:** loadProject(projectId), updateProject(data), updateStats(), setProjectStatus(status)

**Getters:** projectInfo, isProjectLoaded

### 3. aiStore — AI写作/对话状态

**State:** isProcessing, currentTask('generate'\|'chat'\|'analyze'\|'outline'\|null), generationProgress(0-100), generationPhase, streamContent, lastGenerationResult, conversationHistory(Message[]), modelConfig, errorMessage, retryCount

**Actions:** generateChapter(params), continueWriting(prompt), chatWithAI(message), analyzeText(text, type), generateOutline(prompt), cancelGeneration(), resetAIState(), appendStream(chunk), setError(msg), clearError()

**Getters:** isGenerating, currentPhaseText, hasError

### 4. entityStore — 实体数据缓存

**State:** characters[], items[], factions[], locations[], powerSystems[], skills[], foreshadows[], specialSettings[], currencies[], selectedEntityId, selectedEntityType, isLoading(Record), lastFetchedAt(Record)

**Actions:** fetchCharacters/Items/Factions/Locations/PowerSystems/Skills/Foreshadows/SpecialSettings/Currencies(), fetchAll(), selectEntity(id, type), clearSelection(), addCharacter(), updateCharacterInCache(), removeCharacter(), invalidateCache(type?), getEntityById(id, type)

**Getters:** characterList, itemList, factionList, locationList, selectedEntity, entityCounts, isAnyLoading

## 二、业务 Store

### 5. outlineStore
**State:** volumes[], flatChapters[], selectedVolumeId, selectedChapterId, expandedVolumeIds[], isLoading, dragState

**Actions:** fetchOutline, createVolume, createChapter, updateNode, deleteNode, reorderNode, toggleVolumeExpand, selectVolume, selectChapter, moveChapter

### 6. timelineStore
**State:** events[], filters, viewMode('list'\|'timeline'), isLoading

**Actions:** fetchEvents, createEvent, updateEvent, deleteEvent, setFilters, setViewMode

### 7. plotStore
**State:** plotLines[], subplots[], storyCore, selectedPlotId

**Actions:** fetchPlotLines, fetchSubplots, fetchStoryCore, createPlotLine, updatePlotLine, createSubplot, updateSubplot, updateStoryCore

### 8. worldviewStore
**State:** worldview(Worldview|null), isLoading

**Actions:** fetchWorldview, updateWorldview

### 9. uiStore
**State:** sidebarOpen, sidebarView('outline'\|'entity'\|'timeline'\|'plot'), rightPanelOpen, rightPanelView, toastMessages[], confirmDialog, globalLoading, themeMode('light'\|'dark')

**Actions:** toggleSidebar, setSidebarView, toggleRightPanel, setRightPanelView, showToast, showConfirm, hideConfirm, setGlobalLoading, toggleTheme

## 三、Store 协作关系

```
projectStore (最外层)
  ├── outlineStore ←→ editorStore (大纲选中 → 编辑器打开)
  │     │                │
  │     │                └── aiStore (编辑器发起生成 → AI任务)
  │     └── entityStore (大纲涉及的实体数据)
  ├── entityStore (各模块共享实体缓存)
  ├── timelineStore ←→ entityStore (事件关联角色)
  ├── plotStore ←→ outlineStore (情节关联章节)
  ├── worldviewStore (独立)
  └── uiStore (全局UI控制)
```
