// ifcell 求值器纯函数测试锁
// 锁定「剧情推进 = 记忆召回」核心分支求值契约：evaluateIfCell 根据结构化表格数值
// 选出当前激活的人设/剧情阶段纯文本，若求值器被改坏会导致角色人设错乱注入 LLM。
import { describe, it, expect } from "vitest";
import { evaluateIfCell, type IfCellTable } from "./ifcell";

function attrTable(): IfCellTable[] {
  return [
    {
      name: "属性表",
      key: "attr",
      columns: [
        { key: "好感度", label: "好感度" },
        { key: "战力", label: "战力" },
      ],
      rows: [{ name: "苏苏", 好感度: 25, 战力: 80 }],
    },
  ];
}

describe("evaluateIfCell - 入口与边界", () => {
  it("无 <if cell 语法原样返回", () => {
    expect(evaluateIfCell("普通文本", attrTable())).toBe("普通文本");
  });

  it("空内容返回空串", () => {
    expect(evaluateIfCell("", attrTable())).toBe("");
    expect(evaluateIfCell(null as unknown as string, attrTable())).toBe("");
  });
});

describe("evaluateIfCell - 单条件分支", () => {
  it("条件 true 返回 then 分支", () => {
    const c = `<if cell="属性表/苏苏/好感度 <= 30">阶段二</if>`;
    expect(evaluateIfCell(c, attrTable())).toBe("阶段二");
  });

  it("条件 false 且无 else 返回空", () => {
    const c = `<if cell="属性表/苏苏/好感度 <= 10">阶段一</if>`;
    expect(evaluateIfCell(c, attrTable())).toBe("");
  });

  it("条件 false 走 else 分支", () => {
    const c = `<if cell="属性表/苏苏/好感度 <= 10">阶段一<else>陌生</if>`;
    expect(evaluateIfCell(c, attrTable())).toBe("陌生");
  });
});

describe("evaluateIfCell - 嵌套 if/else", () => {
  it("多层嵌套选择正确阶段（好感度25→阶段二）", () => {
    const c = [
      `<if cell="属性表/苏苏/好感度 <= 10">`,
      `阶段一：陌生人`,
      `<else>`,
      `<if cell="属性表/苏苏/好感度 <= 30">`,
      `阶段二：熟悉`,
      `<else>`,
      `阶段三：亲密`,
      `</if>`,
      `</if>`,
    ].join("\n");
    expect(evaluateIfCell(c, attrTable())).toBe("阶段二：熟悉");
  });

  it("嵌套全 false 走到最末 else（好感度25>20→阶段三）", () => {
    const c = [
      `<if cell="属性表/苏苏/好感度 <= 10">阶段一<else>`,
      `<if cell="属性表/苏苏/好感度 <= 20">阶段二<else>阶段三</if>`,
      `</if>`,
    ].join("\n");
    expect(evaluateIfCell(c, attrTable())).toBe("阶段三");
  });
});

describe("evaluateIfCell - 六类比较操作符", () => {
  const t = attrTable();
  it(">= 命中", () => {
    expect(evaluateIfCell(`<if cell="属性表/苏苏/战力 >= 50">A</if>`, t)).toBe("A");
  });
  it("> 边界不命中", () => {
    expect(evaluateIfCell(`<if cell="属性表/苏苏/战力 > 80">A</if>`, t)).toBe("");
  });
  it("< 边界不命中", () => {
    expect(evaluateIfCell(`<if cell="属性表/苏苏/战力 < 80">A</if>`, t)).toBe("");
  });
  it("== 命中", () => {
    expect(evaluateIfCell(`<if cell="属性表/苏苏/战力 == 80">A</if>`, t)).toBe("A");
  });
  it("!= 不命中", () => {
    expect(evaluateIfCell(`<if cell="属性表/苏苏/战力 != 80">A</if>`, t)).toBe("");
  });
});

describe("evaluateIfCell - 数据缺失/异常容错", () => {
  it("表不存在时返回全部阶段参考文本（剥离标签并列展示）", () => {
    const c = `<if cell="不存在表/苏苏/好感度 <= 10">阶段一<else>阶段二</if>`;
    expect(evaluateIfCell(c, attrTable())).toBe("阶段一阶段二");
  });

  it("值非数字时回退全部阶段", () => {
    const t: IfCellTable[] = [{ name: "T", rows: [{ name: "X", 等级: "高" }] }];
    const c = `<if cell="T/X/等级 <= 10">A<else>B</if>`;
    expect(evaluateIfCell(c, t)).toBe("AB");
  });

  it("空表数组不崩溃、回退全部", () => {
    const c = `<if cell="T/X/Y <= 1">A</if>`;
    expect(evaluateIfCell(c, [])).toBe("A");
  });
});

describe("evaluateIfCell - 表/行/列匹配维度", () => {
  it("通过 table key 匹配表而非 name", () => {
    const c = `<if cell="attr/苏苏/好感度 <= 30">命中</if>`;
    expect(evaluateIfCell(c, attrTable())).toBe("命中");
  });

  it("列按 label 匹配", () => {
    const c = `<if cell="属性表/苏苏/好感度 <= 30">命中</if>`;
    expect(evaluateIfCell(c, attrTable())).toBe("命中");
  });

  it("行按非 name 字段值匹配", () => {
    const t: IfCellTable[] = [{ name: "T", rows: [{ id: 1, nick: "小苏", 等级: 5 }] }];
    const c = `<if cell="T/小苏/等级 <= 10">命中</if>`;
    expect(evaluateIfCell(c, t)).toBe("命中");
  });
});
