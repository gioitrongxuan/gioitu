// CLI mỏng nối cụm importer seed DB (trước đây không có caller nào — tooling có
// chủ đích cho thiết kế DB dùng Mazii/KANJIDIC/JMdict, xem đầu mỗi importer).
// Cần Postgres đã chạy migrations (như `npm run server`); in summary JSON rồi thoát.
//
//   npm run import:jmdict   -- <thư_mục_yomitan> [src] [tgt]  # mặc định ja→en;
//                                                             # dùng được cho mọi
//                                                             # thư mục Yomitan lớn
//   npm run import:mazii    -- <mazii.jsonl>
//   npm run import:kanjidic -- <kanjidic2.xml>                # chạy SAU mazii
//                                                             # (enrich ja→vi)

import { pool } from "../../core/db.js";
import { importJmdictDir } from "./jmdictImport.js";
import { importKanjidicFile } from "./kanjidicImport.js";
import { importMaziiFile } from "./maziiImport.js";

const USAGE =
  "Cách dùng: tsx server/src/features/dictionary/importCli.ts <jmdict|mazii|kanjidic> <đường_dẫn> [src] [tgt]";

async function run(): Promise<boolean> {
  const [mode, path, src, tgt] = process.argv.slice(2);
  if (!path) return false;

  switch (mode) {
    case "jmdict":
      console.log(JSON.stringify(await importJmdictDir(path, { term_lang: src, native_lang: tgt }), null, 2));
      return true;
    case "mazii":
      console.log(JSON.stringify(await importMaziiFile(path), null, 2));
      return true;
    case "kanjidic":
      console.log(JSON.stringify(await importKanjidicFile(path), null, 2));
      return true;
    default:
      return false;
  }
}

try {
  if (!(await run())) {
    console.error(USAGE);
    process.exitCode = 1;
  }
} finally {
  // Không end pool thì tiến trình treo chờ các kết nối idle.
  await pool.end();
}
