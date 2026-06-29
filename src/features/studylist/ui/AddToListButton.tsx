// Nút "thêm từ hiện tại vào một study list" trên kết quả tra. Chỉ hiển thị khi
// người dùng đã đăng nhập (study list là tính năng phía server, theo user). Cho
// chọn list sẵn có hoặc tạo nhanh list mới rồi thêm.

import { useState } from "react";
import { authToken } from "@/features/auth/data/auth";
import { addWord, createList, listMine, StudyListSummary, WordRef } from "../data/studyListApi";

export function AddToListButton({ word }: { word: WordRef }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<StudyListSummary[] | null>(null);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");

  // Khách (chưa đăng nhập) không có study list.
  if (!authToken()) return null;

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    setStatus("");
    if (lists === null) {
      try {
        setLists(await listMine());
      } catch (e) {
        setStatus((e as Error).message);
      }
    }
  }

  async function add(listId: string, label: string) {
    try {
      await addWord(listId, word);
      setStatus(`Đã thêm vào “${label}”`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    try {
      const { id } = await createList(name);
      setNewName("");
      setLists((ls) =>
        ls
          ? [{ id, name, isPublic: false, wordCount: 0, createdAt: Date.now(), modifiedAt: Date.now() }, ...ls]
          : ls,
      );
      await add(id, name);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <div className="add-to-list">
      <button className="link" onClick={toggle} aria-expanded={open} title="Thêm vào danh sách học">
        ＋ Danh sách
      </button>
      {open && (
        <div className="add-to-list-menu">
          <div className="atl-new">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tạo danh sách mới…"
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
            />
            <button className="link" disabled={!newName.trim()} onClick={createAndAdd}>
              Tạo &amp; thêm
            </button>
          </div>
          {lists && lists.length > 0 && (
            <ul>
              {lists.map((l) => (
                <li key={l.id}>
                  <button className="link" onClick={() => add(l.id, l.name)}>
                    {l.name} <span className="muted">({l.wordCount})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lists && lists.length === 0 && <p className="muted">Chưa có danh sách nào.</p>}
          {status && <p className="atl-status muted">{status}</p>}
        </div>
      )}
    </div>
  );
}
