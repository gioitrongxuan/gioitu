// Dữ liệu cấu tạo chữ (port ref/jisho-open/backend/src/data): thành phần
// (components), chuỗi mô tả IDS (description sequence), phân loại lục thư
// (structural category + hình thanh keisei). Parser thuần (chuỗi→Map) test được;
// loader đọc file từ thư mục data (mặc định ref/data_kanji).

import * as fs from "node:fs";
import * as path from "node:path";
import type { KanjiEntry, StructuralCategory } from "@/shared/kanji";

export type DescrSeq = string | [string, DescrSeq[]];

export interface KanjiData {
  components: Map<string, string[]>;
  descrSeq: Map<string, string>;
  structural: Record<string, StructuralCategory>;
  /** Phần-âm → các kanji hình thanh dùng nó (và tương tự cho phần-nghĩa). */
  keiseiPhonetic: Map<string, string[]>;
  keiseiSemantic: Map<string, string[]>;
}

const isKanji = (c: string) => /\p{Script=Han}/u.test(c);

/** "kanji;thành_phần" mỗi dòng. Bỏ qua dòng hỏng thay vì sập (file lớn, đời thực). */
export function parseComponents(text: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(";");
    if (parts.length !== 2) continue;
    map.set(parts[0], [...parts[1]]);
  }
  return map;
}

/** "kanji;chuỗiIDS" mỗi dòng → map literal → IDS thô của các phần trực tiếp. */
export function parseDescrSeq(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(";");
    if (parts.length !== 2) continue;
    map.set(parts[0], parts[1]);
  }
  return map;
}

/** Mở rộng đệ quy IDS. undefined nếu không có hoặc tự trỏ về mình (nguyên tử). */
export function expandDescrSeq(map: Map<string, string>, kanji: string): DescrSeq | undefined {
  const seq = map.get(kanji);
  if (seq === undefined || seq === kanji) return undefined;
  const result: [string, DescrSeq[]] = [kanji, []];
  for (const c of seq) result[1].push(expandDescrSeq(map, c) ?? c);
  return result;
}

/** Các kanji thật bên trong một IDS (bỏ toán tử mô tả ⿰⿱… và ký hiệu phi-Hán). */
export function extractComponents(seq: DescrSeq): string[] {
  if (typeof seq === "string") return isKanji(seq) ? [seq] : [];
  const out = [seq[0]];
  for (const inner of seq[1]) out.push(...extractComponents(inner));
  return out;
}

function buildKeiseiUsage(structural: Record<string, StructuralCategory>) {
  const phonetic = new Map<string, string[]>();
  const semantic = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, k: string) => {
    const list = map.get(key);
    if (list) list.push(k);
    else map.set(key, [k]);
  };
  for (const [k, sc] of Object.entries(structural)) {
    if (sc.type !== "keisei") continue;
    add(phonetic, sc.phonetic, k);
    add(semantic, sc.semantic, k);
  }
  return { phonetic, semantic };
}

export const DEFAULT_DATA_DIR = "ref/data_kanji";

export function loadKanjiData(dir: string = DEFAULT_DATA_DIR): KanjiData {
  const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
  const components = parseComponents(read("kanji_components.txt"));
  const descrSeq = parseDescrSeq(read("kanji_description_sequences.txt"));
  const structural = JSON.parse(read("kanji_structural_category.json")) as Record<string, StructuralCategory>;
  const { phonetic, semantic } = buildKeiseiUsage(structural);
  return { components, descrSeq, structural, keiseiPhonetic: phonetic, keiseiSemantic: semantic };
}

/** Bổ sung components/structural/keisei vào entry (thuần — sửa tại chỗ). */
export function attachStructure(entry: KanjiEntry, data: KanjiData): void {
  const components = new Set<string>(data.components.get(entry.literal) ?? []);

  const seq = expandDescrSeq(data.descrSeq, entry.literal);
  if (seq && typeof seq !== "string") {
    for (const part of seq[1]) for (const c of extractComponents(part)) components.add(c);
  }
  entry.components = [...components].sort();

  const sc = data.structural[entry.literal];
  if (sc) entry.structuralCategory = sc;

  const kp = data.keiseiPhonetic.get(entry.literal);
  if (kp) entry.keiseiPhonetic = kp;
  const ks = data.keiseiSemantic.get(entry.literal);
  if (ks) entry.keiseiSemantic = ks;
}
