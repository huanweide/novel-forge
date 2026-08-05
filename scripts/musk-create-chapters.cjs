// 马斯克智能体：批量创建 12 章节点（含大纲，status=outline_only）
const PROJECT_ID = "45bda999-ddd0-4954-b75f-497b17b2f76b";
const BASE = "http://localhost:3001/api/story/nodes";

const chapters = [
  {
    order: 1,
    title: "发射窗口",
    outline: "22 世纪地球生态逼近不可逆临界点。总工程师沈烛在跨行星文明备份局（PCB）成立大会上，第一次面对「地球是单点故障」这个工程事实。本章确立任务：把人类文明编码成可发射的火种。",
    coreConflict: "文明存续 vs 政治短视：预算与紧迫性之间的矛盾。",
    settingDescription: "近地轨道 PCB 总部，窗外是泛着灰霾的地球。",
    activeCharacters: ["沈烛", "局长韦恩"],
  },
  {
    order: 2,
    title: "火种编码",
    outline: "团队将语言、艺术、科学与记忆压缩进抗辐射胶囊。沈烛与编码学家争执：文明该保留「最优样本」还是「全部噪音」？本章揭示火种的本质——不是数据，是选择。",
    coreConflict: "保真度 vs 容量：什么值得被文明记住。",
    settingDescription: "地下编码中心，液氮冷却的量子存储阵列。",
    activeCharacters: ["沈烛", "编码学家老周"],
  },
  {
    order: 3,
    title: "轨道投送网",
    outline: "搭建连接地月、火星与太阳系外缘的轨道投送网络。沈烛用第一性原理重算发射成本，砍掉三分之二冗余节点。工程美学的高光时刻。",
    coreConflict: "成本极限：如何用最少发射完成最大覆盖。",
    settingDescription: "轨道动力学作战室，全息太阳系投影。",
    activeCharacters: ["沈烛", "轨道总师阿岚"],
  },
  {
    order: 4,
    title: "火星前哨",
    outline: "第一批火种 capsule 着陆火星乌托邦平原。机械蜂群自主展开种子库。沈烛收到第一张火星地表回传——文明第一次拥有「备份」。",
    coreConflict: "远程可靠性：无人系统能否在没有地球的情况下自我维持。",
    settingDescription: "火星乌托邦平原，尘暴边缘的前哨站。",
    activeCharacters: ["沈烛", "火星站 AI 守炉"],
  },
  {
    order: 5,
    title: "木卫二冰下",
    outline: "向木卫二冰下海洋投送防水种。冰层钻探遇阻，沈烛力排众议坚持深海备份——因为液态水是最古老的生命容器。",
    coreConflict: "风险 vs 多样性：是否值得为极小概率的海洋文明赌上 capsule。",
    settingDescription: "木卫二冰壳下方十公里，深海热泉口。",
    activeCharacters: ["沈烛", "钻探手卡琳"],
  },
  {
    order: 6,
    title: "资源博弈",
    outline: "地球议会削减 PCB 预算，转向短期气候工程。沈烛在听证会上用「白痴指数」揭穿对手方案的虚高成本。文明备份与地球自救的正面冲突。",
    coreConflict: "地球自救 vs 文明备份：有限的资源给谁。",
    settingDescription: "日内瓦地球议会大厅，全息表决墙。",
    activeCharacters: ["沈烛", "议长莫里"],
  },
  {
    order: 7,
    title: "辐射风暴",
    outline: "一次罕见太阳超级耀斑威胁在轨 capsule 阵列。沈烛下令紧急变轨，部分火种暴露于辐射。数据完整性面临考验，团队第一次接近失败。",
    coreConflict: "技术极限：当宇宙本身成为敌人。",
    settingDescription: "近地轨道，被耀斑照亮的 capsule 阵列。",
    activeCharacters: ["沈烛", "轨道总师阿岚"],
  },
  {
    order: 8,
    title: "比邻星航程",
    outline: "恒星际方舟「余烬号」点火，载着文明样本驶向比邻星。沈烛知道这趟旅程将持续数百年，自己永远不会看到抵达。存在主义锚定：为看不见的未来发射。",
    coreConflict: "时间尺度：为百年后的文明承担今日的代价。",
    settingDescription: "日球层顶，余烬号的离子尾焰拉长成光带。",
    activeCharacters: ["沈烛", "方舟 AI 余烬"],
  },
  {
    order: 9,
    title: "记忆裂隙",
    outline: "火星种子库检测到编码裂隙——部分记忆在传输中静默损坏。沈烛带领团队用冗余校验抢救，揭示「备份也会遗忘」。",
    coreConflict: "熵增不可逆：备份自身的退化。",
    settingDescription: "火星前哨修复舱，闪烁告警的存储墙。",
    activeCharacters: ["沈烛", "编码学家老周"],
  },
  {
    order: 10,
    title: "叛逃者",
    outline: "核心成员卡琳认为备份是逃避，偷走一枚 capsule 试图重返地球抢救活人。沈烛在追逐与放手中重新定义「文明」的边界。",
    coreConflict: "理念分裂：备份文明，还是拯救活人。",
    settingDescription: "地月转移轨道，两艘飞船的沉默对峙。",
    activeCharacters: ["沈烛", "钻探手卡琳"],
  },
  {
    order: 11,
    title: "最后一次发射",
    outline: "地球生态崩溃进入读秒，最后一批 capsule 必须在窗口闭合前离轨。沈烛押上全部剩余发射架。这是人类从地球发出的最后一句话。",
    coreConflict: "终极窗口：错过即永久沉默。",
    settingDescription: "赤道发射场，最后一缕地球蓝天下的烈焰。",
    activeCharacters: ["沈烛", "局长韦恩"],
  },
  {
    order: 12,
    title: "火种点亮",
    outline: "多年后，火星、木卫二、比邻星三处火种同时被「唤醒」确认在线。多行星文明第一次成立。沈烛的白发映着三块屏幕的光——文明不再是单点故障。尾声定格在「确认」二字。",
    coreConflict: "闭环：从单点故障到三处冗余。",
    settingDescription: "PCB 总部，三块屏幕分别亮起火星、木卫二、比邻星。",
    activeCharacters: ["沈烛", "火星站 AI 守炉", "方舟 AI 余烬"],
  },
];

(async () => {
  const results = [];
  for (const ch of chapters) {
    const body = {
      projectId: PROJECT_ID,
      type: "chapter",
      title: ch.title,
      order: ch.order,
      status: "outline_only",
      outline: ch.outline,
      coreConflict: ch.coreConflict,
      settingDescription: ch.settingDescription,
      activeCharacters: ch.activeCharacters,
      isMainBranch: true,
    };
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    results.push({ order: ch.order, title: ch.title, id: json.id, status: res.status });
    console.log(`#${ch.order} ${ch.title} -> ${res.status} ${json.id || JSON.stringify(json).slice(0, 80)}`);
  }
  const ok = results.filter((r) => r.status === 201).length;
  console.log(`\nCREATED ${ok}/${chapters.length} chapters`);
  if (ok !== chapters.length) process.exit(1);
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
