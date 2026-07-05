// Data-access cho đóng góp từ điển chung (#70 — 6.1). User tạo đề xuất (pending);
// admin duyệt (chèn vào từ điển hệ thống qua dictStore.upsertTerm) hoặc từ chối.

import crypto from "node:crypto";
import { pool } from "../../core/db.js";
import * as dictStore from "../dictionary/dictStore.js";

export interface Proposal {
  id: string;
  proposed_by: string;
  term_lang: string;
  native_lang: string;
  term: string;
  reading: string | null;
  gloss: string[];
  pos: string[];
  status: string;
  created_at: number;
}

export interface ProposalInput {
  term_lang: string;
  native_lang: string;
  term: string;
  reading?: string;
  gloss: string[];
  pos?: string[];
}

interface ProposalRow {
  id: string;
  proposed_by: string;
  term_lang: string;
  native_lang: string;
  term: string;
  reading: string | null;
  gloss: string;
  pos: string | null;
  status: string;
  created_at: string;
}

function rowToProposal(r: ProposalRow): Proposal {
  return {
    id: r.id,
    proposed_by: r.proposed_by,
    term_lang: r.term_lang,
    native_lang: r.native_lang,
    term: r.term,
    reading: r.reading,
    gloss: JSON.parse(r.gloss) as string[],
    pos: r.pos ? (JSON.parse(r.pos) as string[]) : [],
    status: r.status,
    created_at: Number(r.created_at),
  };
}

export async function propose(userId: string, input: ProposalInput): Promise<{ ok: boolean; error?: string }> {
  const term = input.term.trim();
  const gloss = (input.gloss ?? []).map((g) => g.trim()).filter(Boolean);
  if (!term || !input.term_lang || !input.native_lang) return { ok: false, error: "Thiếu từ hoặc cặp ngôn ngữ" };
  if (!gloss.length) return { ok: false, error: "Thiếu nghĩa để đề xuất" };

  await pool.query(
    `INSERT INTO dict_proposals (id, proposed_by, term_lang, native_lang, term, reading, gloss, pos, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
    [
      crypto.randomUUID(),
      userId,
      input.term_lang,
      input.native_lang,
      term,
      input.reading?.trim() || null,
      JSON.stringify(gloss),
      JSON.stringify((input.pos ?? []).filter(Boolean)),
      Date.now(),
    ],
  );
  return { ok: true };
}

export async function listPending(): Promise<Proposal[]> {
  const { rows } = await pool.query<ProposalRow>(
    "SELECT * FROM dict_proposals WHERE status = 'pending' ORDER BY created_at ASC",
  );
  return rows.map(rowToProposal);
}

export async function reject(id: string, reviewer: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "UPDATE dict_proposals SET status = 'rejected', reviewed_by = $1, reviewed_at = $2 WHERE id = $3 AND status = 'pending'",
    [reviewer, Date.now(), id],
  );
  return (rowCount ?? 0) > 0;
}

/** Duyệt: chèn vào từ điển hệ thống (tái dùng upsertTerm của admin) rồi đánh dấu. */
export async function approve(id: string, reviewer: string): Promise<boolean> {
  const { rows } = await pool.query<ProposalRow>(
    "SELECT * FROM dict_proposals WHERE id = $1 AND status = 'pending'",
    [id],
  );
  if (!rows[0]) return false;
  const p = rowToProposal(rows[0]);

  await dictStore.upsertTerm({
    term: p.term,
    term_lang: p.term_lang,
    native_lang: p.native_lang,
    reading: p.reading ?? undefined,
    senses: [{ pos: p.pos, misc: [], gloss: p.gloss }],
  });

  await pool.query(
    "UPDATE dict_proposals SET status = 'approved', reviewed_by = $1, reviewed_at = $2 WHERE id = $3",
    [reviewer, Date.now(), id],
  );
  return true;
}
