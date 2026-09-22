import { unzipSync, strFromU8 } from "fflate";

export type Material = {
  id: string;
  file: string;
  location: string;
  text: string;
  confirmed: boolean;
  sourceUrl?: string;
  sourceKind?: "teacher-material" | "official-reference";
  verifiedAt?: string;
};
export const MAX_CHUNKS = 200;

export function validateMaterials(value: unknown): value is Material[] {
  return Array.isArray(value) && value.length <= MAX_CHUNKS && value.every(c =>
    c && typeof c.id === "string" && c.id.length <= 100 && typeof c.file === "string" && c.file.length <= 255 &&
    typeof c.location === "string" && c.location.length <= 100 && typeof c.text === "string" && c.text.length <= 2000 &&
    typeof c.confirmed === "boolean" && (c.sourceUrl === undefined || (typeof c.sourceUrl === "string" && c.sourceUrl.length <= 500 && /^https:\/\//.test(c.sourceUrl))) &&
    (c.sourceKind === undefined || c.sourceKind === "teacher-material" || c.sourceKind === "official-reference") &&
    (c.verifiedAt === undefined || (typeof c.verifiedAt === "string" && c.verifiedAt.length <= 30))) && new Set(value.map(c => c.id)).size === value.length;
}

/** Sparse lexical TF-IDF vectors, with Chinese bigrams. No neural embedding API. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]+/g) || []).flatMap(word =>
    /^[a-z0-9]+$/.test(word) ? [word] : Array.from({ length: Math.max(0, word.length - 1) }, (_, i) => word.slice(i, i + 2)));
}

export function retrieve(query: string, materials: Material[], limit = 3) {
  const docs = materials.filter(c => c.confirmed && c.text.trim());
  const bags = docs.map(c => tokens(c.text));
  const df = new Map<string, number>();
  for (const bag of bags) for (const token of new Set(bag)) df.set(token, (df.get(token) || 0) + 1);
  const vector = (bag: string[]) => {
    const v = new Map<string, number>();
    for (const token of bag) v.set(token, (v.get(token) || 0) + 1);
    for (const [token, count] of v) v.set(token, (1 + Math.log(count)) * (Math.log((docs.length + 1) / ((df.get(token) || 0) + 1)) + 1));
    const norm = Math.sqrt([...v.values()].reduce((sum, n) => sum + n * n, 0));
    for (const [token, weight] of v) v.set(token, weight / (norm || 1));
    return v;
  };
  const q = vector(tokens(query));
  return docs.map((chunk, i) => ({ ...chunk, score: [...vector(bags[i])].reduce((sum, [t, w]) => sum + w * (q.get(t) || 0), 0) }))
    .filter(c => c.score > 0.06).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function chunkText(file: string, location: string, text: string): Material[] {
  const chunks: Material[] = [];
  let buffer = "";
  const push = () => { if (buffer.trim()) chunks.push({ id: crypto.randomUUID(), file, location: location + (chunks.length ? `（續 ${chunks.length}）` : ""), text: buffer.trim(), confirmed: false }); buffer = ""; };
  for (const sentence of text.split(/(?<=[。！？\n])/)) {
    if (buffer.length + sentence.length > 1200) push();
    for (let i = 0; i < sentence.length; i += 1200) { buffer += sentence.slice(i, i + 1200); if (buffer.length >= 1200) push(); }
  }
  push();
  return chunks;
}

/** Runs on the teacher's browser. Original Office files never leave the device. */
export async function parseMaterial(file: File): Promise<Material[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error("每份教材上限 10 MB。");
  const ext = file.name.split(".").pop()?.toLowerCase();
  let result: Material[] = [];
  if (ext === "txt" || ext === "md") {
    result = (await file.text()).split(/\n\s*\n/).flatMap((t, i) => chunkText(file.name, `段落 ${i + 1}`, t));
  } else if (ext === "pptx" || ext === "docx") {
    let expanded = 0;
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
      const selected = ext === "pptx" ? /^ppt\/slides\/slide\d+\.xml$/.test(entry.name) || ["ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"].includes(entry.name) : entry.name === "word/document.xml";
      if (selected) { expanded += entry.originalSize; if (expanded > 12 * 1024 * 1024) throw new Error("教材展開後過大，請拆成較小檔案。"); }
      return selected;
    } });
    const parseXML = (bytes: Uint8Array) => {
      const xml = strFromU8(bytes);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("教材 XML 格式不支援。");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) throw new Error("教材 XML 無法解析。");
      return doc;
    };
    let paths = Object.keys(archive).filter(p => ext === "pptx" ? /^ppt\/slides\/slide\d+\.xml$/.test(p) : p === "word/document.xml").sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const presentation = archive["ppt/presentation.xml"], relationships = archive["ppt/_rels/presentation.xml.rels"];
    if (ext === "pptx" && presentation && relationships) {
      const rels = new Map(Array.from(parseXML(relationships).getElementsByTagNameNS("*", "Relationship")).filter(r => r.getAttribute("TargetMode") !== "External").map(r => [r.getAttribute("Id"), r.getAttribute("Target") || ""]));
      paths = Array.from(parseXML(presentation).getElementsByTagNameNS("*", "sldId")).map(s => {
        const id = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
        const target = rels.get(id) || "";
        const path = target.startsWith("/ppt/") ? target.slice(1) : "ppt/" + target;
        if (!/^ppt\/slides\/slide\d+\.xml$/.test(path) || !archive[path]) throw new Error("無法核對簡報投影片順序。");
        return path;
      });
    }
    for (const [index, path] of paths.entries()) {
      const xml = strFromU8(archive[path]);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("教材 XML 格式不支援。");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) throw new Error("教材 XML 無法解析。");
      const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p")).map(p => Array.from(p.getElementsByTagNameNS("*", "t")).map(t => t.textContent || "").join(""));
      if (ext === "pptx") result.push(...chunkText(file.name, `投影片 ${presentation && relationships ? index + 1 : path.match(/slide(\d+)/)?.[1]}`, paragraphs.join("\n")));
      else result.push(...paragraphs.flatMap((p, i) => chunkText(file.name, `段落 ${i + 1}`, p)));
    }
  } else throw new Error("請提供 PPTX、DOCX、TXT 或 Markdown；舊版 PPT／DOC 請先另存新格式。PDF 與圖片辨識尚未開放。");
  if (!result.length) throw new Error("找不到可擷取文字。圖片式教材請另外提供文字講稿。");
  if (result.length > MAX_CHUNKS) throw new Error("教材超過 200 段，請縮小展示範圍。");
  return result;
}
