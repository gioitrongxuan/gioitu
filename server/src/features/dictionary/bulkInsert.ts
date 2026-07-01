// INSERT nhiều dòng theo mẻ để không vượt giới hạn tham số của Postgres
// (~65k placeholder / câu). Dùng chung cho các importer set-based (Mazii, JMdict).

import type { PoolClient } from "pg";

export async function bulkInsert(
  client: PoolClient,
  table: string,
  cols: string[],
  rows: unknown[][],
  chunkRows: number,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkRows) {
    const slice = rows.slice(i, i + chunkRows);
    const params: unknown[] = [];
    const tuples = slice.map((r, j) => {
      const base = j * cols.length;
      params.push(...r);
      return "(" + cols.map((_, k) => "$" + (base + k + 1)).join(",") + ")";
    });
    await client.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
}
