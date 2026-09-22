import { tokens, validateMaterials, type Material } from "./materials.ts";

export const MAX_NODES = 12;
export const MAX_EDGES = 18;
export const MAX_QUESTIONS = 5;

export type KnowledgeNode = {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  sourceIds: string[];
  teacherConfirmed: boolean;
};

export type KnowledgeEdge = {
  from: string;
  to: string;
  type: "prerequisite" | "part_of" | "related";
  reason: string;
  sourceIds: string[];
  teacherConfirmed: boolean;
};

export type SupportProfile = {
  captions: boolean;
  simplifiedText: boolean;
  focusSteps: boolean;
  colorSafe: boolean;
  textToSpeech: boolean;
  reducedMotion: boolean;
  advancedChallenge: boolean;
};

export type MasteryEvidence = {
  conceptId: string;
  state: "unknown" | "needs-check" | "developing" | "ready";
  evidenceCount: number;
  lastUpdated: string;
};

export type DiagnosticQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  conceptIds: string[];
  feedback: string;
  sourceIds: string[];
  teacherConfirmed: boolean;
};

export type SupportCard = {
  id: string;
  conceptId: string;
  title: string;
  baseText: string;
  simplifiedText: string;
  focusSteps: string[];
  keywords: string[];
  advancedPrompt: string;
  sourceIds: string[];
  teacherConfirmed: boolean;
};

export type StudentProfile = {
  id: string;
  displayName: string;
  support: SupportProfile;
};

export type LessonPackage = {
  version: 2;
  id: string;
  title: string;
  grade: string;
  objective: string;
  createdAt: string;
  materials: Material[];
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  questions: DiagnosticQuestion[];
  cards: SupportCard[];
  profiles: StudentProfile[];
};

export type LiveSupportDecision = {
  conceptId: string;
  supportCardId: string | null;
  reason: string;
  sourceIds: string[];
  stable: boolean;
};

export type LiveFrame = {
  lessonId: string;
  transcript: string;
  activeConceptId: string | null;
  decision: LiveSupportDecision | null;
  paused: boolean;
  updatedAt: string;
};

export const DEFAULT_SUPPORT: SupportProfile = {
  captions: true,
  simplifiedText: false,
  focusSteps: false,
  colorSafe: false,
  textToSpeech: false,
  reducedMotion: false,
  advancedChallenge: false,
};

export const DEFAULT_PROFILES: StudentProfile[] = [
  { id: "A", displayName: "學生 A", support: { ...DEFAULT_SUPPORT, colorSafe: true } },
  { id: "B", displayName: "學生 B", support: { ...DEFAULT_SUPPORT, simplifiedText: true, textToSpeech: true } },
  { id: "C", displayName: "學生 C", support: { ...DEFAULT_SUPPORT, focusSteps: true, reducedMotion: true } },
];

const stringOk = (value: unknown, max = 2_000) => typeof value === "string" && value.length <= max;
const stringList = (value: unknown, max: number) => Array.isArray(value) && value.length <= max && value.every(item => stringOk(item, 200));

function hasPrerequisiteCycle(nodes: KnowledgeNode[], edges: KnowledgeEdge[]) {
  const graph = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const edge of edges.filter(edge => edge.type === "prerequisite")) graph.get(edge.from)?.push(edge.to);
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) || []) if (visit(next)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return nodes.some(node => visit(node.id));
}

export function validateLessonPackage(value: unknown): value is LessonPackage {
  if (!value || typeof value !== "object") return false;
  const lesson = value as LessonPackage;
  if (lesson.version !== 2 || !stringOk(lesson.id, 100) || !stringOk(lesson.title, 200) || !stringOk(lesson.grade, 100) || !stringOk(lesson.objective, 500) || !stringOk(lesson.createdAt, 100)) return false;
  if (!validateMaterials(lesson.materials) || !Array.isArray(lesson.nodes) || lesson.nodes.length < 1 || lesson.nodes.length > MAX_NODES || !Array.isArray(lesson.edges) || lesson.edges.length > MAX_EDGES || !Array.isArray(lesson.questions) || lesson.questions.length < 3 || lesson.questions.length > MAX_QUESTIONS || !Array.isArray(lesson.cards) || !Array.isArray(lesson.profiles)) return false;
  if (lesson.nodes.some(item => !item || typeof item !== "object") || lesson.edges.some(item => !item || typeof item !== "object") || lesson.questions.some(item => !item || typeof item !== "object") || lesson.cards.some(item => !item || typeof item !== "object") || lesson.profiles.some(item => !item || typeof item !== "object" || !item.support || typeof item.support !== "object")) return false;
  const materialIds = new Set(lesson.materials.map(item => item.id));
  const nodeIds = new Set(lesson.nodes.map(node => node.id));
  const validSources = (ids: unknown) => stringList(ids, 5) && (ids as string[]).length > 0 && (ids as string[]).every(id => materialIds.has(id));
  if (nodeIds.size !== lesson.nodes.length || lesson.nodes.some(node => !stringOk(node.id, 100) || !stringOk(node.label, 100) || !stringOk(node.description, 500) || !stringList(node.aliases, 8) || !validSources(node.sourceIds) || typeof node.teacherConfirmed !== "boolean")) return false;
  if (lesson.edges.some(edge => !nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to || !["prerequisite", "part_of", "related"].includes(edge.type) || !stringOk(edge.reason, 500) || !validSources(edge.sourceIds) || typeof edge.teacherConfirmed !== "boolean") || hasPrerequisiteCycle(lesson.nodes, lesson.edges)) return false;
  if (lesson.questions.some(question => !stringOk(question.id, 100) || !stringOk(question.prompt, 500) || !stringList(question.options, 4) || question.options.length < 2 || !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.options.length || !stringList(question.conceptIds, 2) || question.conceptIds.some(id => !nodeIds.has(id)) || !stringOk(question.feedback, 500) || !validSources(question.sourceIds) || typeof question.teacherConfirmed !== "boolean")) return false;
  if (lesson.cards.some(card => !stringOk(card.id, 100) || !nodeIds.has(card.conceptId) || !stringOk(card.title, 200) || !stringOk(card.baseText, 700) || !stringOk(card.simplifiedText, 700) || !stringList(card.focusSteps, 4) || !stringList(card.keywords, 6) || !stringOk(card.advancedPrompt, 500) || !validSources(card.sourceIds) || typeof card.teacherConfirmed !== "boolean")) return false;
  return lesson.profiles.length >= 1 && lesson.profiles.length <= 6 && lesson.profiles.every(profile => stringOk(profile.id, 30) && stringOk(profile.displayName, 50) && profile.support && Object.values(profile.support).every(value => typeof value === "boolean"));
}

export function lessonReady(lesson: LessonPackage) {
  return lesson.nodes.every(item => item.teacherConfirmed) && lesson.edges.every(item => item.teacherConfirmed) && lesson.questions.every(item => item.teacherConfirmed) && lesson.cards.every(item => item.teacherConfirmed) && !hasPrerequisiteCycle(lesson.nodes, lesson.edges);
}

function overlapScore(query: string, text: string) {
  const q = tokens(query), target = new Set(tokens(text));
  if (!q.length || !target.size) return 0;
  return q.reduce((score, token) => score + (target.has(token) ? 1 : 0), 0) / Math.sqrt(q.length * target.size);
}

export function matchConcept(transcript: string, lesson: LessonPackage) {
  const ranked = lesson.nodes.map(node => ({
    node,
    score: Math.max(overlapScore(transcript, [node.label, node.description, ...node.aliases].join(" ")), node.aliases.some(alias => alias.length >= 2 && transcript.toLowerCase().includes(alias.toLowerCase())) ? 0.72 : 0),
  })).sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score >= 0.18 ? ranked[0] : null;
}

export function decideLiveSupport(transcript: string, lesson: LessonPackage, previousConceptId?: string | null): LiveSupportDecision | null {
  const match = matchConcept(transcript, lesson);
  if (!match) return null;
  const card = lesson.cards.find(item => item.conceptId === match.node.id && item.teacherConfirmed);
  return {
    conceptId: match.node.id,
    supportCardId: card?.id || null,
    reason: `教師本段提到「${match.node.label}」，與已確認教材概念相符。`,
    sourceIds: card?.sourceIds || match.node.sourceIds,
    stable: previousConceptId === match.node.id,
  };
}

export function updateMastery(current: MasteryEvidence | undefined, conceptId: string, correct: boolean): MasteryEvidence {
  const evidenceCount = (current?.evidenceCount || 0) + 1;
  let state: MasteryEvidence["state"];
  if (!correct) state = "needs-check";
  else if (current?.state === "developing" || current?.state === "ready" || evidenceCount >= 2) state = "ready";
  else state = "developing";
  return { conceptId, state, evidenceCount, lastUpdated: new Date().toISOString() };
}

export function confirmEntireLesson(lesson: LessonPackage): LessonPackage {
  return {
    ...lesson,
    nodes: lesson.nodes.map(item => ({ ...item, teacherConfirmed: true })),
    edges: lesson.edges.map(item => ({ ...item, teacherConfirmed: true })),
    questions: lesson.questions.map(item => ({ ...item, teacherConfirmed: true })),
    cards: lesson.cards.map(item => ({ ...item, teacherConfirmed: true })),
  };
}

export function buildFallbackLesson(input: { title: string; grade: string; objective: string; materials: Material[] }): LessonPackage {
  const materials = input.materials.filter(item => item.confirmed && item.text.trim()).slice(0, 12);
  if (!materials.length) throw new Error("至少需要一段已確認教材。");
  const phishing = materials.some(item => /釣魚|寄件者|網域|連結|密碼/.test(item.text));
  const genericSpecs: Array<readonly [string, string, string, readonly string[]]> = materials.slice(0, 5).map((material, index) => [`concept-${index + 1}`, material.location, material.text.slice(0, 160), [material.location]] as const);
  while (genericSpecs.length < 3) {
    const number = genericSpecs.length + 1;
    const source = materials[(number - 1) % materials.length];
    genericSpecs.push([`concept-${number}`, `核心概念 ${number}`, source.text.slice(0, 160), [source.location, `概念 ${number}`]]);
  }
  const specs = phishing ? [
    ["phishing", "釣魚郵件", "偽裝可信任來源，誘導收件者交出資料或執行危險操作。", ["釣魚", "陌生郵件"]],
    ["sender-domain", "寄件者網域", "檢查 @ 後方的完整網域，辨認拼字或非官方結尾。", ["寄件者", "網域", "Email 網域"]],
    ["suspicious-url", "可疑網址", "點擊前檢查網址拼字、網域與不明縮址。", ["網址", "連結", "縮址"]],
    ["urgent-pressure", "緊急要求", "限時、停權與威脅語句會製造壓力，使人忽略查證。", ["緊急", "24 小時", "立即"]],
    ["mfa", "多因素驗證", "密碼以外再使用可信裝置或驗證碼，降低帳號被盜風險。", ["多因素驗證", "MFA", "驗證碼"]],
  ] as const : genericSpecs;
  const officialIds = (pattern: RegExp) => materials.filter(item => item.sourceKind === "official-reference" && pattern.test(`${item.file} ${item.location} ${item.text}`)).map(item => item.id).slice(0, 2);
  const nodes: KnowledgeNode[] = specs.map((spec, index) => {
    const teacherSource = materials.find(item => item.sourceKind !== "official-reference" && (item.text.includes(spec[1]) || spec[3].some(alias => item.text.includes(alias)))) || materials.find(item => item.sourceKind !== "official-reference") || materials[0];
    const official = phishing ? officialIds(index === 4 ? /MFA|多因素|驗證|CISA|NIST/i : index === 1 ? /寄件者|網域|衛生福利部|社交工程/ : /釣魚|連結|社交工程|CISA|NIST/i) : [];
    return { id: spec[0], label: spec[1], description: spec[2], aliases: [...spec[3]], sourceIds: [...new Set([teacherSource.id, ...official])], teacherConfirmed: false };
  });
  const edges: KnowledgeEdge[] = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id, type: index < 2 ? "prerequisite" : "related", reason: `先理解「${nodes[index].label}」有助於辨認「${node.label}」。`, sourceIds: [...new Set([...nodes[index].sourceIds, ...node.sourceIds])].slice(0, 5), teacherConfirmed: false }));
  const questions: DiagnosticQuestion[] = nodes.slice(0, Math.min(MAX_QUESTIONS, Math.max(3, nodes.length))).map((node, index) => ({
    id: `question-${index + 1}`, prompt: phishing ? ["陌生郵件要求立刻改密碼時，第一步應該做什麼？", "判斷寄件者是否可信，應優先檢查哪一部分？", "點開縮網址前，較安全的做法是什麼？", "為什麼詐騙郵件常強調限時處理？", "多因素驗證提供什麼額外保護？"][index] : `下列哪一項最符合「${node.label}」？`,
    options: phishing ? [["直接點連結", "先停下並查證來源", "立即輸入密碼"], ["顯示名稱", "@ 後方完整網域", "信件顏色"], ["先確認實際網域", "直接登入", "轉寄給所有人"], ["製造壓力降低查證", "提升網速", "節省文字"], ["增加第二道驗證", "公開密碼", "取消登入"]][index] : [node.description, "與教材無關的敘述", "尚未在教材中說明"],
    correctIndex: phishing ? 1 - (index === 1 || index === 2 || index === 4 ? 0 : 0) : 0,
    conceptIds: [node.id], feedback: `這題用來確認「${node.label}」的理解；單次答錯只代表需要再確認。`, sourceIds: node.sourceIds, teacherConfirmed: false,
  }));
  if (phishing) { questions[1].correctIndex = 1; questions[2].correctIndex = 0; questions[3].correctIndex = 0; if (questions[4]) questions[4].correctIndex = 0; }
  const cards: SupportCard[] = nodes.map(node => ({ id: `card-${node.id}`, conceptId: node.id, title: node.label, baseText: node.description, simplifiedText: `先記住：${node.description.split(/[。；]/)[0]}。`, focusSteps: ["先停一下，不急著操作。", `找出畫面中的「${node.label}」。`, "依教材規則完成查證。"], keywords: node.aliases.slice(0, 4), advancedPrompt: `想一想：若攻擊者刻意模仿「${node.label}」的正常特徵，還能用哪些證據交叉驗證？`, sourceIds: node.sourceIds, teacherConfirmed: false }));
  return { version: 2, id: crypto.randomUUID(), title: input.title.slice(0, 200), grade: input.grade.slice(0, 100), objective: input.objective.slice(0, 500), createdAt: new Date().toISOString(), materials, nodes, edges, questions, cards, profiles: DEFAULT_PROFILES.map(profile => ({ ...profile, support: { ...profile.support } })) };
}

export const PHISHING_SAMPLE_MATERIALS: Material[] = [
  { id: "sample-1", file: "資訊安全微課教案.docx", location: "教學目標", text: "學生能在收到陌生郵件時先停止操作，辨認釣魚郵件常見特徵並從官方管道查證。", confirmed: false, sourceKind: "teacher-material" },
  { id: "sample-2", file: "釣魚郵件辨識.pptx", location: "投影片 2：寄件者網域", text: "寄件者顯示名稱可以偽裝，應檢查 @ 後方的完整網域與拼字；單看顯示名稱或 .gov.tw 字樣不足以判斷真偽，仍應由官方管道查證。", confirmed: false, sourceKind: "teacher-material" },
  { id: "sample-3", file: "釣魚郵件辨識.pptx", location: "投影片 3：可疑網址", text: "點擊前應查看實際網址，注意近似字母、額外字元與不明縮址；不要直接從郵件輸入帳號或密碼。", confirmed: false, sourceKind: "teacher-material" },
  { id: "sample-4", file: "釣魚郵件辨識.pptx", location: "投影片 4：心理陷阱", text: "詐騙信常以限時停權、立即驗證或領獎製造緊迫感，使收件者來不及查證。", confirmed: false, sourceKind: "teacher-material" },
  { id: "sample-5", file: "釣魚郵件辨識.pptx", location: "投影片 5：帳號防護", text: "多因素驗證在密碼之外增加可信裝置或驗證碼，可降低只有密碼外洩時的帳號風險；並非所有 MFA 都具有相同的抗釣魚能力。", confirmed: false, sourceKind: "teacher-material" },
  { id: "official-moda", file: "數位發展部資通安全署", location: "防範社交工程：停、看、聽", text: "官方建議面對可疑郵件採取停、不點擊；看、檢查寄件者與附件；聽、透過其他管道查證並通報。此處為教學用摘要，不是原文重製。", confirmed: false, sourceUrl: "https://moda.gov.tw/ACS/press/news/press/17714", sourceKind: "official-reference", verifiedAt: "2026-09-22" },
  { id: "official-mohw", file: "衛生福利部", location: "偽冒寄件者案例", text: "政府機關曾公告顯示名稱看似官方、實際寄送網域卻不同的釣魚案例，說明顯示名稱不能單獨作為真偽依據。此處為教學用摘要。", confirmed: false, sourceUrl: "https://www.mohw.gov.tw/cp-4343-63084-1.html", sourceKind: "official-reference", verifiedAt: "2026-09-22" },
  { id: "official-cisa", file: "CISA Secure Our World", location: "Recognize phishing and use MFA", text: "CISA 將辨識與通報釣魚、使用強密碼、開啟多因素驗證及更新軟體列為一般使用者的重要安全行動。此處為教學用摘要。", confirmed: false, sourceUrl: "https://www.cisa.gov/be-cyber-smart/report-incident", sourceKind: "official-reference", verifiedAt: "2026-09-22" },
  { id: "official-nist", file: "NIST", location: "Phishing guidance", text: "NIST 建議對要求點連結、下載檔案、登入或提供敏感資料的訊息再次查證，並建議啟用多因素驗證；較進階可採抗釣魚驗證。此處為教學用摘要。", confirmed: false, sourceUrl: "https://www.nist.gov/itl/smallbusinesscyber/guidance-topic/phishing", sourceKind: "official-reference", verifiedAt: "2026-09-22" },
];
