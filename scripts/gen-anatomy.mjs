// Trích hình người + nội tạng từ bộ *anatomogram* của EBI Expression Atlas
// (Apache-2.0) thành một module dữ liệu thuần cho màn "Quanh ta".
//
// Chạy lại khi cần:
//   npm pack @ebi-gene-expression-group/anatomogram --pack-destination /tmp
//   tar xzf /tmp/ebi-gene-expression-group-anatomogram-*.tgz -C /tmp
//   node scripts/gen-anatomy.mjs /tmp/package/lib/svg/homo_sapiens.male.svg
//
// Vì sao sinh sẵn thay vì phụ thuộc thẳng vào gói npm: gói nặng 13MB cho vài
// chục loài, ta chỉ cần một hình và ~20 bộ phận. File sinh ra kèm ghi công
// theo Apache-2.0 §4 (xem `src/features/scenes/domain/anatomy.ts`).
//
// Script CỐ Ý gắn với cấu trúc file gốc (một lớp `LAYER_OUTLINE` chứa path
// `human_male_outline`, một lớp `LAYER_EFO` mà mỗi con là một bộ phận có
// `<title>`): gốc đổi cấu trúc thì script dừng với lỗi rõ ràng, chứ không âm
// thầm sinh ra file rỗng.

import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = process.argv[2];
const OUT = new URL("../src/features/scenes/domain/anatomy.ts", import.meta.url);

/** Bộ phận cần lấy: khoá trong file sinh ra ← `<title>` trong file gốc. */
const WANTED = {
  brain: "brain",
  tongue: "tongue",
  throat: "throat",
  esophagus: "esophagus",
  lung: "lung",
  heart: "heart",
  aorta: "aorta",
  diaphragm: "diaphragm",
  liver: "liver",
  stomach: "stomach",
  pancreas: "pancreas",
  spleen: "spleen",
  kidney: "kidney",
  smallIntestine: "small intestine",
  colon: "colon",
  bladder: "urinary bladder",
  bone: "bone",
  muscle: "skeletal muscle",
};

// KHÔNG lấy `trachea` (126 path, 52KB) và `nerve` (32 path, 74KB): ở cỡ ô chú
// giải chúng chỉ còn là mảng nét đen đặc, mà lại nặng gấp đôi tất cả phần còn
// lại cộng vào — màn này nạp theo React.lazy nên cân nặng chunk đáng kể.

// ---- Đọc XML: file gốc là XML chuẩn của Inkscape, không có CDATA/comment
// lồng trong hai lớp ta đụng tới, nên một bộ quét thẻ đơn giản là đủ. ----

const TAG_SOURCE = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/;
/** Bộ quét thẻ dùng `lastIndex` nên mỗi lượt quét phải có instance riêng. */
const tags = () => new RegExp(TAG_SOURCE, "g");

function attrs(raw) {
  const out = {};
  for (const m of raw.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/** Các phần tử con trực tiếp của thẻ mở tại `from`, kèm markup của từng con. */
function children(src, from) {
  const TAG = tags();
  TAG.lastIndex = from;
  let depth = 0;
  const kids = [];
  let open = null;
  for (let m; (m = TAG.exec(src)); ) {
    const closing = m[1] === "/";
    const selfClosing = m[4] === "/";
    if (!closing && !selfClosing) {
      if (depth === 1 && !open) open = { start: m.index, tag: m[2], raw: m[3] };
      depth++;
    } else if (closing) {
      depth--;
      if (depth === 0) break;
      if (depth === 1 && open) {
        kids.push({ ...open, end: TAG.lastIndex });
        open = null;
      }
    } else if (depth === 1) {
      kids.push({ start: m.index, end: TAG.lastIndex, tag: m[2], raw: m[3] });
    }
  }
  return kids;
}

function layer(src, id) {
  const at = src.indexOf(`id="${id}"`);
  if (at < 0) throw new Error(`không thấy lớp ${id} trong file gốc`);
  const start = src.lastIndexOf("<g", at);
  return { start, kids: children(src, start) };
}

// ---- Hình học: gộp transform vào toạ độ, đổi ellipse thành path ----

const IDENTITY = [1, 0, 0, 1, 0, 0];

function parseTransform(t) {
  if (!t) return IDENTITY;
  let m = /^translate\(\s*([-\d.e]+)[,\s]+([-\d.e]+)\s*\)$/.exec(t.trim());
  if (m) return [1, 0, 0, 1, +m[1], +m[2]];
  m = /^matrix\(([^)]*)\)$/.exec(t.trim());
  if (m) {
    const n = m[1].split(/[,\s]+/).filter(Boolean).map(Number);
    if (n.length === 6) return n;
  }
  m = /^scale\(\s*([-\d.e]+)(?:[,\s]+([-\d.e]+))?\s*\)$/.exec(t.trim());
  if (m) return [+m[1], 0, 0, m[2] === undefined ? +m[1] : +m[2], 0, 0];
  throw new Error(`transform chưa hỗ trợ: ${t}`);
}

const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];

/** m ∘ n: áp n trước rồi tới m (đúng thứ tự transform lồng nhau của SVG). */
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const round = (n) => Math.round(n * 100) / 100;

/**
 * Đưa path về hệ toạ độ gốc. File gốc chỉ dùng lệnh tuyệt đối M/L/C/Z — gặp
 * lệnh khác thì dừng, vì áp transform cho lệnh tương đối cần thêm trạng thái.
 */
function bakePath(d, tm) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out = [];
  let cmd = "";
  let i = 0;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "Z" || cmd === "z") {
      out.push("Z");
      continue;
    }
    if (!"MLC".includes(cmd)) throw new Error(`lệnh path chưa hỗ trợ: ${cmd}`);
    const n = cmd === "C" ? 3 : 1;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const [x, y] = apply(tm, +tokens[i++], +tokens[i++]);
      pts.push(round(x), round(y));
    }
    out.push(cmd + pts.join(" "));
  }
  return out.join("");
}

const KAPPA = 0.5522847498307936;

function ellipseToPath(a, tm) {
  const cx = +a.cx || 0;
  const cy = +a.cy || 0;
  const rx = +(a.rx ?? a.r) || 0;
  const ry = +(a.ry ?? a.r) || 0;
  const p = (x, y) => apply(tm, x, y).map(round);
  const seg = [];
  const quads = [
    [[cx + rx, cy - ry * KAPPA], [cx + rx * KAPPA, cy - ry], [cx, cy - ry]],
    [[cx - rx * KAPPA, cy - ry], [cx - rx, cy - ry * KAPPA], [cx - rx, cy]],
    [[cx - rx, cy + ry * KAPPA], [cx - rx * KAPPA, cy + ry], [cx, cy + ry]],
    [[cx + rx * KAPPA, cy + ry], [cx + rx, cy + ry * KAPPA], [cx + rx, cy]],
  ];
  seg.push("M" + p(cx + rx, cy).join(" "));
  for (const q of quads) seg.push("C" + q.map(([x, y]) => p(x, y).join(" ")).join(" "));
  return seg.join("") + "Z";
}

/** Hộp bao chính xác: điểm mút của mỗi đoạn + cực trị của Bézier bậc ba. */
function bbox(ds) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const hit = (x, y) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  const extrema = (p0, p1, p2, p3) => {
    const out = [p0, p3];
    const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
    const b = 6 * (p0 - 2 * p1 + p2);
    const c = 3 * (p1 - p0);
    const roots = Math.abs(a) < 1e-9
      ? Math.abs(b) < 1e-9 ? [] : [-c / b]
      : (() => {
          const disc = b * b - 4 * a * c;
          if (disc < 0) return [];
          const s = Math.sqrt(disc);
          return [(-b + s) / (2 * a), (-b - s) / (2 * a)];
        })();
    for (const t of roots) {
      if (!(t > 0 && t < 1)) continue;
      const u = 1 - t;
      out.push(u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3);
    }
    return out;
  };
  for (const d of ds) {
    const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    let cmd = "";
    let i = 0;
    let cur = [0, 0];
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      if (cmd === "Z") continue;
      if (cmd === "C") {
        const p = [];
        for (let k = 0; k < 3; k++) p.push([+tokens[i++], +tokens[i++]]);
        for (const v of extrema(cur[0], p[0][0], p[1][0], p[2][0])) hit(v, cur[1]);
        for (const v of extrema(cur[1], p[0][1], p[1][1], p[2][1])) hit(cur[0], v);
        cur = p[2];
        hit(cur[0], cur[1]);
      } else {
        cur = [+tokens[i++], +tokens[i++]];
        hit(cur[0], cur[1]);
      }
    }
  }
  return [round(x0), round(y0), round(x1 - x0), round(y1 - y0)];
}

// ---- Sinh file ----

const src = readFileSync(SOURCE, "utf8");
const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(src);
if (!view) throw new Error("không đọc được viewBox của file gốc");

const outlineLayer = layer(src, "LAYER_OUTLINE");
const outlineKid = outlineLayer.kids.find((k) => attrs(k.raw).id === "human_male_outline");
if (!outlineKid) throw new Error("không thấy path human_male_outline");
const outline = bakePath(attrs(outlineKid.raw).d, IDENTITY);

const efo = layer(src, "LAYER_EFO");
const byName = new Map();
for (const kid of efo.kids) {
  const markup = src.slice(kid.start, kid.end);
  const title = /<title[^>]*>([^<]*)<\/title>/.exec(markup);
  if (title) byName.set(title[1].trim(), kid);
}

/** Nhóm lồng nhau có transform riêng, nên phải đi đệ quy và nhân dồn ma trận. */
function collect(text, from, tm, out) {
  for (const kid of children(text, from)) {
    const a = attrs(kid.raw);
    const local = mul(tm, parseTransform(a.transform));
    if (kid.tag === "g") collect(text, kid.start, local, out);
    else if (kid.tag === "path" && a.d) out.push(bakePath(a.d, local));
    else if (kid.tag === "ellipse" || kid.tag === "circle") out.push(ellipseToPath(a, local));
  }
  return out;
}

const parts = {};
for (const [key, name] of Object.entries(WANTED)) {
  const kid = byName.get(name);
  if (!kid) throw new Error(`file gốc không có bộ phận "${name}"`);
  const a = attrs(kid.raw);
  const tm = parseTransform(a.transform);
  const ds =
    kid.tag === "g"
      ? collect(src, kid.start, tm, [])
      : kid.tag === "path" && a.d
        ? [bakePath(a.d, tm)]
        : [ellipseToPath(a, tm)];
  if (!ds.length) throw new Error(`bộ phận "${name}" không có hình nào`);
  parts[key] = { d: ds, box: bbox(ds) };
}

const lines = [
  "// SINH TỰ ĐỘNG bởi `scripts/gen-anatomy.mjs` — đừng sửa tay.",
  "//",
  "// Nguồn: anatomogram của EBI Expression Atlas (`homo_sapiens.male.svg`),",
  "// © EMBL-EBI, giấy phép Apache License 2.0 — xem `LICENSE.anatomogram.txt`",
  "// cạnh file này. Chỉ giữ lại đường viền cơ thể và những bộ phận màn \"Quanh",
  "// ta\" cần; toạ độ đã gộp transform và làm tròn 2 chữ số.",
  "",
  "/** Khung toạ độ gốc của hình (mọi `d` và `box` dưới đây tính theo hệ này). */",
  `export const ANATOMY_VIEW = { w: ${+view[1]}, h: ${+view[2]} } as const;`,
  "",
  "/** Đường viền cơ thể nhìn chính diện. */",
  `export const BODY_OUTLINE = ${JSON.stringify(outline)};`,
  "",
  "export interface AnatomyPart {",
  "  /** Các path hợp thành bộ phận. */",
  "  d: string[];",
  "  /** Hộp bao khít `[x, y, w, h]` — dùng để đặt neo và co hình vào ô chú giải. */",
  "  box: readonly [number, number, number, number];",
  "}",
  "",
  "export type OrganKey = keyof typeof ORGANS;",
  "",
  "export const ORGANS = {",
  ...Object.entries(parts).map(
    ([k, v]) => `  ${k}: { d: ${JSON.stringify(v.d)}, box: [${v.box.join(", ")}] },`,
  ),
  "} satisfies Record<string, AnatomyPart>;",
  "",
];
writeFileSync(OUT, lines.join("\n"));

const size = (s) => `${(s / 1024).toFixed(1)}KB`;
console.log(`outline ${size(outline.length)}`);
for (const [k, v] of Object.entries(parts)) {
  console.log(`  ${k.padEnd(16)} ${String(v.d.length).padStart(3)} path  ${size(v.d.join("").length).padStart(8)}  box ${v.box.join(",")}`);
}
console.log(`→ ${OUT.pathname} ${size(lines.join("\n").length)}`);
