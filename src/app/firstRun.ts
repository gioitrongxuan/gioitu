// Onboarding lần đầu (#152): quyết định "có chào không" là logic thuần để test
// được; localStorage chỉ là chỗ nhớ "đã xem" (cùng idiom GuestBackupBanner).

const STORAGE_KEY = "gioitu.onboarded.v1";

export function loadOnboarded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // storage cấm (ẩn danh): đừng chào lại mỗi lần mở — coi như đã xem
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Query param mở thẳng bước cài từ điển của màn chào — App xoá khỏi URL sau khi đọc. */
export const DICT_SETUP_PARAM = "dicts";

/** Bước "Chọn nguồn từ điển" trong màn chào (Onboarding.tsx). */
export const DICT_SETUP_STEP = 1;

/**
 * Extension mới cài mở `<app>/?dicts=1` để dẫn người dùng tới bước tải từ điển
 * về máy (#251). Đây là ý định rõ ràng của người dùng chứ không phải lời chào
 * tự động, nên mở kể cả khi cờ "đã xem" đã bật — decideOnboarding không xen vào.
 */
export function wantsDictSetup(params: URLSearchParams): boolean {
  return params.get(DICT_SETUP_PARAM) === "1";
}

export type OnboardingDecision =
  | "show" // người mới thật sự: hiện màn chào 3 bước
  | "adopt" // dùng app từ trước khi có onboarding: đánh dấu đã xem, không làm phiền
  | "none"; // đã xem rồi

/**
 * Chỉ chào người chưa có gì trên máy: ai đã có dữ liệu học hoặc từ điển local
 * hiển nhiên biết dùng app — chào lại sau một bản cập nhật chỉ gây khó chịu.
 */
export function decideOnboarding(
  seen: boolean,
  hasStudyData: boolean,
  hasLocalDict: boolean,
): OnboardingDecision {
  if (seen) return "none";
  return hasStudyData || hasLocalDict ? "adopt" : "show";
}
