// Khu "Tôi" (#149): tài khoản/đồng bộ + cài đặt + quản trị — thay cho menu ☰
// cũ (9–11 mục phẳng trộn 4 loại khái niệm). Mỗi hàng một hành động; mục cần
// đăng nhập đeo ổ khoá cho khách (tường đăng nhập nhất quán, không giấu hẳn
// cũng không mời-rồi-chặn).

import { LockIcon } from "@/shared/ui/icons";
import "./shell.css";

export interface MeItem {
  label: string;
  run: () => void;
  /** Cần đăng nhập mới dùng được: hiện ổ khoá + gợi ý, thay vì giấu hay chặn bất ngờ. */
  locked?: boolean;
}

export interface MeSection {
  title: string;
  items: MeItem[];
}

export function MeScreen({ email, sections }: { email: string | null; sections: MeSection[] }) {
  return (
    <div className="me-screen">
      <div className="me-account">
        <div className="me-account-name">{email ?? "Khách"}</div>
        {email == null && <div className="me-account-sub">Đăng nhập để đồng bộ giữa các thiết bị</div>}
      </div>
      {sections.map((section) =>
        section.items.length === 0 ? null : (
          <section key={section.title} className="me-section">
            <h3 className="me-section-title">{section.title}</h3>
            {section.items.map((item) => (
              <button
                key={item.label}
                type="button"
                className="link me-item"
                onClick={item.run}
                aria-label={item.locked ? `${item.label} — cần đăng nhập` : undefined}
                title={item.locked ? "Cần đăng nhập" : undefined}
              >
                <span className="me-item-label">{item.label}</span>
                {item.locked && <LockIcon className="me-item-lock" />}
              </button>
            ))}
          </section>
        ),
      )}
    </div>
  );
}
