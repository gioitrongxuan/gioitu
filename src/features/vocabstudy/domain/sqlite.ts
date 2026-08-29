// Bộ đọc SQLite tối giản, CHỈ ĐỌC, đủ để quét vài bảng của `collection.anki2`.
//
// Vì sao không mượn thư viện: bản SQLite biên dịch ra WebAssembly nặng hơn 1 MB,
// mà ta chỉ cần một việc duy nhất — duyệt hết một bảng theo thứ tự rowid. Không
// index, không WHERE, không ghi. Phần đó của định dạng đã đóng băng hai chục năm
// và gói gọn trong ~250 dòng hàm thuần, test thoải mái trên fixture.
//
// Đặc tả: https://www.sqlite.org/fileformat.html
//
// Giới hạn có chủ ý — gặp thì ném lỗi rõ ràng chứ không đoán bừa: không đọc
// bảng WITHOUT ROWID, không đọc index, không hiểu WAL. Gói Anki không dùng thứ nào.

/** Một ô trong bảng. Số nguyên trả về dạng `number`: khoá của Anki là mốc thời
 *  gian mili-giây (~2^41) nên còn cách xa ngưỡng mất chính xác 2^53. */
export type SqlValue = number | string | Uint8Array | null;

/** Một hàng đã đọc: giá trị theo đúng thứ tự cột, kèm rowid. */
export interface SqlRow {
  rowid: number;
  values: SqlValue[];
}

export interface SqliteTable {
  columns: string[];
  rows: SqlRow[];
}

const HEADER_SIZE = 100;
const MAGIC = "SQLite format 3\0";

/** Mã loại trang b-tree. Ta chỉ đi trên hai loại của bảng. */
const PAGE_INTERIOR_TABLE = 0x05;
const PAGE_LEAF_TABLE = 0x0d;

export class SqliteFile {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly pageSize: number;
  /** Số byte dùng được trên một trang: cuối trang có thể chừa chỗ cho phần mở
   *  rộng (mã hoá…). Gần như luôn bằng `pageSize`, nhưng phép tính trang tràn
   *  dựa hết vào con số này nên không được phép giả định. */
  private readonly usableSize: number;
  /** Tên bảng → trang gốc và danh sách cột, đọc một lần từ `sqlite_master`. */
  private readonly schema = new Map<string, { rootPage: number; columns: string[] }>();

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) !== MAGIC) {
      throw new Error("Không phải tệp SQLite — gói Anki hỏng hoặc sai định dạng");
    }
    // Cỡ trang ghi bằng 2 byte nên 65536 không biểu diễn được; đặc tả quy ước
    // giá trị 1 nghĩa là 65536.
    const declared = this.view.getUint16(16, false);
    this.pageSize = declared === 1 ? 65536 : declared;
    this.usableSize = this.pageSize - this.view.getUint8(20);
    this.readSchema();
  }

  /** Tên các bảng có trong tệp. */
  tableNames(): string[] {
    return [...this.schema.keys()];
  }

  columnsOf(table: string): string[] {
    const meta = this.schema.get(table);
    if (!meta) throw new Error(`Bảng “${table}” không có trong gói Anki`);
    return meta.columns;
  }

  /**
   * Duyệt toàn bảng theo thứ tự rowid, gọi `visit` cho từng hàng.
   *
   * Kiểu callback chứ không trả mảng: một deck lớn có hàng trăm nghìn note, dựng
   * hết thành mảng rồi mới lọc là ôm cả trăm MB vô ích. Nơi gọi chỉ giữ lại
   * đúng mấy cột nó cần.
   */
  scanTable(table: string, visit: (row: SqlRow) => void): void {
    const meta = this.schema.get(table);
    if (!meta) throw new Error(`Bảng “${table}” không có trong gói Anki`);
    // Trang đã đi qua: tệp hỏng có thể tạo vòng lặp trong cây, không chặn thì treo tab.
    this.walk(meta.rootPage, visit, new Set());
  }

  /** Đọc trọn một bảng. Dùng cho test và cho bảng bé (`col`). */
  readTable(table: string): SqliteTable {
    const rows: SqlRow[] = [];
    this.scanTable(table, (r) => rows.push(r));
    return { columns: this.columnsOf(table), rows };
  }

  /** `sqlite_master` luôn nằm ở trang 1 — điểm tựa để biết mọi bảng khác ở đâu. */
  private readSchema(): void {
    const MASTER_COLUMNS = { type: 0, name: 1, rootPage: 3, sql: 4 };
    this.walk(
      1,
      (row) => {
        if (row.values[MASTER_COLUMNS.type] !== "table") return;
        const name = row.values[MASTER_COLUMNS.name];
        const rootPage = row.values[MASTER_COLUMNS.rootPage];
        const sql = row.values[MASTER_COLUMNS.sql];
        if (typeof name !== "string" || typeof rootPage !== "number" || typeof sql !== "string") return;
        this.schema.set(name, { rootPage, columns: parseColumnNames(sql) });
      },
      new Set(),
    );
  }

  /** Đi đệ quy trên cây b-tree của một bảng, từ trái sang phải. */
  private walk(pageNumber: number, visit: (row: SqlRow) => void, seen: Set<number>): void {
    if (seen.has(pageNumber)) throw new Error("Cây b-tree có vòng lặp — tệp SQLite hỏng");
    seen.add(pageNumber);

    // Trang 1 mở đầu bằng 100 byte header của cả tệp, header b-tree nằm ngay sau.
    const pageStart = (pageNumber - 1) * this.pageSize;
    const headerAt = pageNumber === 1 ? HEADER_SIZE : pageStart;
    const type = this.view.getUint8(headerAt);
    if (type !== PAGE_LEAF_TABLE && type !== PAGE_INTERIOR_TABLE) {
      throw new Error(`Trang b-tree loại 0x${type.toString(16)} — chưa hỗ trợ`);
    }

    const cellCount = this.view.getUint16(headerAt + 3, false);
    const isLeaf = type === PAGE_LEAF_TABLE;
    // Trang trong có thêm con trỏ 4 byte tới cây con ngoài cùng bên phải.
    const cellPointers = headerAt + (isLeaf ? 8 : 12);

    for (let i = 0; i < cellCount; i += 1) {
      const cellAt = pageStart + this.view.getUint16(cellPointers + i * 2, false);
      if (isLeaf) {
        visit(this.readLeafCell(cellAt));
      } else {
        this.walk(this.view.getUint32(cellAt, false), visit, seen);
      }
    }
    if (!isLeaf) this.walk(this.view.getUint32(headerAt + 8, false), visit, seen);
  }

  /** Một ô của trang lá: cỡ payload, rowid, rồi bản ghi (có thể tràn sang trang khác). */
  private readLeafCell(at: number): SqlRow {
    const size = readVarint(this.view, at);
    const rowid = readVarint(this.view, size.next);
    const payload = this.readPayload(rowid.next, size.value);
    return { rowid: rowid.value, values: decodeRecord(payload) };
  }

  /**
   * Gom bản ghi lại từ phần nằm trên trang và (nếu có) chuỗi trang tràn.
   *
   * Đây là chỗ dễ sai nhất của cả bộ đọc, và là chỗ *chắc chắn* bị chạm: một
   * note của Anki gồm câu ví dụ, furigana và HTML, dài hơn nhiều so với sức chứa
   * một trang. Công thức lấy nguyên từ đặc tả — trông tuỳ tiện nhưng là cách
   * SQLite cân giữa "đừng phí trang tràn" và "đừng để trang lá quá thưa".
   */
  private readPayload(at: number, total: number): Uint8Array {
    const maxLocal = this.usableSize - 35;
    if (total <= maxLocal) return this.bytes.subarray(at, at + total);

    const minLocal = Math.floor(((this.usableSize - 12) * 32) / 255) - 23;
    const surplus = minLocal + ((total - minLocal) % (this.usableSize - 4));
    const inPage = surplus <= maxLocal ? surplus : minLocal;

    const out = new Uint8Array(total);
    out.set(this.bytes.subarray(at, at + inPage));
    let filled = inPage;
    // Con trỏ trang tràn nằm ngay SAU phần payload trên trang.
    let next = this.view.getUint32(at + inPage, false);
    const seen = new Set<number>();
    while (next !== 0 && filled < total) {
      if (seen.has(next)) throw new Error("Chuỗi trang tràn có vòng lặp — tệp SQLite hỏng");
      seen.add(next);
      const pageAt = (next - 1) * this.pageSize;
      const chunk = Math.min(this.usableSize - 4, total - filled);
      out.set(this.bytes.subarray(pageAt + 4, pageAt + 4 + chunk), filled);
      filled += chunk;
      next = this.view.getUint32(pageAt, false);
    }
    if (filled < total) throw new Error("Chuỗi trang tràn đứt giữa chừng — tệp SQLite hỏng");
    return out;
  }
}

/** Số nguyên biến thiên: tối đa 9 byte, bit cao nhất báo "còn byte nữa". */
function readVarint(view: DataView, at: number): { value: number; next: number } {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    const byte = view.getUint8(at + i);
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: at + i + 1 };
  }
  // Byte thứ 9 góp trọn 8 bit, không có bit báo tiếp.
  return { value: value * 256 + view.getUint8(at + 8), next: at + 9 };
}

/** Mã kiểu 0–9 có độ dài cố định; từ 12 trở lên là BLOB/TEXT dài tuỳ nội dung. */
const FIXED_WIDTH = [0, 1, 2, 3, 4, 6, 8, 8, 0, 0];

/**
 * Bung một bản ghi: phần đầu là danh sách mã kiểu, phần thân là dữ liệu thô.
 *
 * Cột `INTEGER PRIMARY KEY` luôn được ghi là NULL vì giá trị thật của nó chính
 * là rowid — nơi gọi cần `id` thì lấy từ `SqlRow.rowid`.
 */
export function decodeRecord(payload: Uint8Array): SqlValue[] {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const header = readVarint(view, 0);
  const types: number[] = [];
  let at = header.next;
  while (at < header.value) {
    const t = readVarint(view, at);
    types.push(t.value);
    at = t.next;
  }

  const decoder = new TextDecoder();
  const values: SqlValue[] = [];
  let body = header.value;
  for (const type of types) {
    if (type === 0) {
      values.push(null);
    } else if (type === 8 || type === 9) {
      // Hai giá trị hay gặp nhất được nhét thẳng vào mã kiểu, không tốn byte thân.
      values.push(type - 8);
    } else if (type < 10) {
      values.push(readNumber(view, body, type));
      body += FIXED_WIDTH[type];
    } else if (type >= 12) {
      const length = Math.floor((type - 12) / 2);
      const slice = payload.subarray(body, body + length);
      // Lẻ là TEXT, chẵn là BLOB.
      values.push(type % 2 === 1 ? decoder.decode(slice) : slice);
      body += length;
    } else {
      throw new Error(`Mã kiểu ${type} không hợp lệ — tệp SQLite hỏng`);
    }
  }
  return values;
}

/** Số nguyên big-endian 1/2/3/4/6/8 byte, hoặc số thực 8 byte. */
function readNumber(view: DataView, at: number, type: number): number {
  switch (type) {
    case 1:
      return view.getInt8(at);
    case 2:
      return view.getInt16(at, false);
    case 3:
      // 24 bit: ghép tay, dịch trái rồi dịch phải số học để giữ dấu.
      return ((view.getUint8(at) << 24) | (view.getUint8(at + 1) << 16) | (view.getUint8(at + 2) << 8)) >> 8;
    case 4:
      return view.getInt32(at, false);
    case 5:
      return view.getInt16(at, false) * 2 ** 32 + view.getUint32(at + 2, false);
    case 6:
      return Number(view.getBigInt64(at, false));
    default:
      return view.getFloat64(at, false);
  }
}

/** Từ khoá mở đầu một ràng buộc ở cấp bảng — không phải tên cột. */
const TABLE_CONSTRAINTS = new Set(["constraint", "primary", "unique", "check", "foreign"]);

/**
 * Rút tên cột từ câu `CREATE TABLE`. Chỉ đọc phần trong ngoặc ngoài cùng, tách ở
 * dấu phẩy *cấp ngoài*, rồi lấy định danh đầu mỗi mảnh.
 *
 * Không phải trình phân tích SQL, nhưng cũng không được ngây thơ: câu lệnh lưu
 * lại là bản người ta gõ, y nguyên chú thích. Bảng `notes` của Anki có đúng một
 * cái bẫy như thế — `-- … là cố ý, bởi vì …` — và dấu phẩy trong câu chú thích
 * ấy từng làm bộ đọc này đẻ ra một cột tên "bởi vì" rồi đẩy lệch mọi cột sau nó.
 * Nên phải gỡ chú thích TRƯỚC, và cẩn thận với dấu phẩy lồng trong ngoặc
 * (`decimal(10, 2)`) lẫn tên cột bọc trong nháy.
 */
export function parseColumnNames(sql: string): string[] {
  const clean = stripSqlComments(sql);
  const open = clean.indexOf("(");
  const close = clean.lastIndexOf(")");
  if (open < 0 || close < open) return [];

  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let quote = "";
  for (const ch of clean.slice(open + 1, close)) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      cur += ch;
    } else if (ch === "(") {
      depth += 1;
      cur += ch;
    } else if (ch === ")") {
      depth -= 1;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);

  const columns: string[] = [];
  for (const part of parts) {
    const name = firstIdentifier(part);
    if (name && !TABLE_CONSTRAINTS.has(name.toLowerCase())) columns.push(name);
  }
  return columns;
}

/**
 * Gỡ chú thích SQL (cả loại hai gạch tới hết dòng lẫn loại khối) khỏi câu lệnh,
 * nhưng chừa nguyên phần nằm trong chuỗi hoặc trong định danh có nháy — ở đó hai
 * dấu gạch chỉ là hai ký tự bình thường của một cái tên.
 */
function stripSqlComments(sql: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
    } else if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      if (end < 0) break;
      // Giữ lại chính ký tự xuống dòng: nó là khoảng trắng ngăn cách hợp lệ.
      i = end - 1;
    } else if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) break;
      out += " ";
      i = end + 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Định danh đầu tiên của một mảnh định nghĩa cột, đã gỡ nháy nếu có. */
function firstIdentifier(part: string): string {
  const text = part.trim();
  const quoted = /^(["'`\[])(.*?)[\"'`\]]/.exec(text);
  if (quoted) return quoted[2];
  return /^[A-Za-z_][\w$]*/.exec(text)?.[0] ?? "";
}
