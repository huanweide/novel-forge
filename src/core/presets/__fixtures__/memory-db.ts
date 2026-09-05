// 测试用内存版「数据库」——实现 plan/apply/undo 三个模块所需的最小 Prisma 接口。
// 目的：预设的注入计划、执行、撤销全流程都能在纯内存里断言，不依赖真实 SQLite。

export interface MemoryState {
  loreTables: any[];
  styleCards: any[];
  lorebookEntries: any[];
  characters: any[];
  project: any;
  calls: { created: string[]; updated: string[]; deleted: string[] };
}

export function createMemoryDb(seed?: {
  projectId?: string;
  project?: any;
  loreTables?: any[];
  styleCards?: any[];
  lorebookEntries?: any[];
  characters?: any[];
}) {
  const projectId = seed?.projectId ?? "p1";
  const state: MemoryState = {
    loreTables: seed?.loreTables ?? [],
    styleCards: seed?.styleCards ?? [],
    lorebookEntries: seed?.lorebookEntries ?? [],
    characters: seed?.characters ?? [],
    project: seed?.project ?? {
      id: projectId,
      name: "测试项目",
      appliedPresets: [],
      postProcessingRules: [],
      llmConfig: {},
    },
    calls: { created: [], updated: [], deleted: [] },
  };

  // 自增从 1000 起：避免与测试种子里预置的固定 id（如 cc_1 / le_1）撞车，
  // 否则撤销按 id 删除会误删预置数据（曾导致"删错人"的假失败）。
  let auto = 1000;
  const nextId = (prefix: string) => `${prefix}_${auto++}`;
  const notFound = (what: string) => {
    throw new Error(`${what} 不存在（模拟 P2025）`);
  };

  const db = {
    loreTable: {
      findFirst: async ({ where }: any) =>
        state.loreTables.find((t) => t.projectId === where.projectId && t.key === where.key) ?? null,
      create: async ({ data }: any) => {
        const rec = { id: nextId("lt"), ...data };
        state.loreTables.push(rec);
        state.calls.created.push(`loreTable:${rec.id}`);
        return rec;
      },
      delete: async ({ where }: any) => {
        const i = state.loreTables.findIndex((t) => t.id === where.id);
        if (i < 0) notFound("表格");
        const [r] = state.loreTables.splice(i, 1);
        state.calls.deleted.push(`loreTable:${r.id}`);
        return r;
      },
    },
    styleCard: {
      findFirst: async ({ where }: any) =>
        state.styleCards.find((s) => s.projectId === where.projectId) ?? null,
      create: async ({ data }: any) => {
        const rec = { id: nextId("sc"), ...data };
        state.styleCards.push(rec);
        state.calls.created.push(`styleCard:${rec.id}`);
        return rec;
      },
      update: async ({ where, data }: any) => {
        const s = state.styleCards.find((x) => x.id === where.id);
        if (!s) notFound("文风卡");
        Object.assign(s, data);
        state.calls.updated.push(`styleCard:${s.id}`);
        return s;
      },
      delete: async ({ where }: any) => {
        const i = state.styleCards.findIndex((x) => x.id === where.id);
        if (i < 0) notFound("文风卡");
        const [r] = state.styleCards.splice(i, 1);
        state.calls.deleted.push(`styleCard:${r.id}`);
        return r;
      },
    },
    lorebookEntry: {
      findFirst: async ({ where }: any) =>
        state.lorebookEntries.find(
          (e) => e.projectId === where.projectId && e.category === where.category && e.title === where.title,
        ) ?? null,
      create: async ({ data }: any) => {
        const rec = { id: nextId("le"), ...data };
        state.lorebookEntries.push(rec);
        state.calls.created.push(`lorebookEntry:${rec.id}`);
        return rec;
      },
      update: async ({ where, data }: any) => {
        const e = state.lorebookEntries.find((x) => x.id === where.id);
        if (!e) notFound("词条");
        Object.assign(e, data);
        state.calls.updated.push(`lorebookEntry:${e.id}`);
        return e;
      },
      delete: async ({ where }: any) => {
        const i = state.lorebookEntries.findIndex((x) => x.id === where.id);
        if (i < 0) notFound("词条");
        const [r] = state.lorebookEntries.splice(i, 1);
        state.calls.deleted.push(`lorebookEntry:${r.id}`);
        return r;
      },
    },
    characterCard: {
      findFirst: async ({ where }: any) => {
        const name = where?.name?.equals;
        return state.characters.find((c) => c.projectId === where.projectId && c.name === name) ?? null;
      },
      create: async ({ data }: any) => {
        const rec = { id: nextId("cc"), ...data };
        state.characters.push(rec);
        state.calls.created.push(`characterCard:${rec.id}`);
        return rec;
      },
      delete: async ({ where }: any) => {
        const i = state.characters.findIndex((x) => x.id === where.id);
        if (i < 0) notFound("角色卡");
        const [r] = state.characters.splice(i, 1);
        state.calls.deleted.push(`characterCard:${r.id}`);
        return r;
      },
    },
    project: {
      findUnique: async ({ where }: any) => (state.project.id === where.id ? state.project : null),
      update: async ({ where, data }: any) => {
        if (state.project.id !== where.id) notFound("项目");
        Object.assign(state.project, data);
        state.calls.updated.push("project");
        return state.project;
      },
    },
  };

  return { db, state };
}
