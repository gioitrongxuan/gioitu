// Từ vựng theo khung cảnh (#294): mỗi cảnh là một bức tranh kèm các "ghim" đặt
// đúng chỗ vật đó nằm — học 冷蔵庫 bằng cách thấy nó đứng ở đâu trong bếp, thay
// vì đọc một danh sách phẳng.
//
// Phần này THUẦN dữ liệu + toạ độ. Phòng ốc dùng tranh nét vẽ trong
// `ui/SceneArt.tsx`; hai cảnh cơ thể dùng hình giải phẫu có sẵn ở
// `domain/anatomy.ts` (nguồn EBI, Apache-2.0) nên toạ độ neo của chúng viết
// theo hệ của hình đó rồi mới đổi sang khung cảnh — sửa cỡ hình chỉ phải sửa
// `BODY_FIGURE`, không phải đặt lại từng ghim.

import { ANATOMY_VIEW, ORGANS, OrganKey } from "./anatomy";

/** Khung vẽ của một cảnh (đơn vị SVG) — mọi toạ độ ghim tính theo hệ này. */
export interface ArtBox {
  w: number;
  h: number;
}

/** Phòng ốc nhìn ngang: khung 4/3, ghim đặt thẳng lên vật nên không cần lề. */
export const ROOM_ART: ArtBox = { w: 160, h: 120 };

/**
 * Cảnh cơ thể: khung dọc, hình người ở giữa và hai cột chú giải ở lề — lối
 * dựng của hình giải phẫu.
 */
export const BODY_ART: ArtBox = { w: 200, h: 260 };

/** Bề ngang dành cho hình người; phần còn lại của khung là lề cho hai cột ô. */
const FIGURE_W = 122;

/** Chỗ đặt hình giải phẫu trong khung cảnh: canh giữa cả hai chiều. */
export const BODY_FIGURE = {
  scale: FIGURE_W / ANATOMY_VIEW.w,
  x: (BODY_ART.w - FIGURE_W) / 2,
  y: (BODY_ART.h - (ANATOMY_VIEW.h * FIGURE_W) / ANATOMY_VIEW.w) / 2,
} as const;

/** Đổi một điểm trên hình giải phẫu sang toạ độ khung cảnh. */
export function figurePoint(x: number, y: number): { x: number; y: number } {
  return { x: BODY_FIGURE.x + x * BODY_FIGURE.scale, y: BODY_FIGURE.y + y * BODY_FIGURE.scale };
}

/**
 * Ô chú giải ở lề: bên trong là chính bộ phận đó phóng to, nối vào hình bằng
 * một đường dẫn. Ô đủ rộng để làm luôn vùng bấm.
 */
export const CALLOUT_W = 34;
export const CALLOUT_H = 24;

export type SceneId = "body" | "organs" | "house" | "kitchen" | "office";

export interface ScenePin {
  /** Mặt chữ Nhật. */
  term: string;
  /** Cách đọc (kana) — dùng cho furigana và cho giọng đọc. */
  reading: string;
  /** Nghĩa tiếng Việt. */
  meaning: string;
  /** Vị trí ghim trong khung của cảnh; với ghim có ô chú giải đây là tâm ô. */
  x: number;
  y: number;
  /**
   * Điểm mà ghim trỏ tới, theo hệ toạ độ của hình giải phẫu (ANATOMY_VIEW) —
   * chỉ hai cảnh cơ thể dùng. Cảnh phòng ốc thì vật đủ rộng, ghim đặt thẳng
   * lên vật nên không có neo.
   */
  ax?: number;
  ay?: number;
  /**
   * Bộ phận trong `ORGANS`: vẽ lên hình người và làm hình nhỏ trong ô chú
   * giải. Có `organ` thì neo tự lấy tâm hộp bao, khỏi đặt tay.
   */
  organ?: OrganKey;
}

export interface Scene {
  id: SceneId;
  /** Nhãn tiếng Việt (nút chọn cảnh). */
  label: string;
  /** Tên cảnh bằng tiếng Nhật + cách đọc — bản thân nó cũng là một từ để học. */
  ja: string;
  jaReading: string;
  /** Một dòng dẫn nhập, đặt dưới tiêu đề cảnh. */
  note: string;
  /** Khung vẽ của cảnh — quyết định luôn tỉ lệ khung tranh trên màn. */
  art: ArtBox;
  pins: ScenePin[];
}

// Toạ độ ghim đặt tay theo hình ở SceneArt: sửa hình thì sửa cả toạ độ ở đây.
// Hai cảnh cơ thể xếp chú giải thành hai cột (x = 19 và x = 141) với hàng cách
// đều; thứ tự trong mảng đi từ trên xuống theo cột trái rồi cột phải, và neo
// cũng đi từ trên xuống — nhờ vậy các đường dẫn không cắt nhau.
export const SCENES: Scene[] = [
  {
    id: "body",
    label: "Cơ thể (bên ngoài)",
    ja: "体の外側",
    jaReading: "からだのそとがわ",
    note: "Những bộ phận nhìn thấy được — đi khám, đi tiệm, tả người đều cần.",
    art: BODY_ART,
    pins: [
      { term: "頭", reading: "あたま", meaning: "đầu", x: 19, y: 22, ax: 53, ay: 4 },
      { term: "髪", reading: "かみ", meaning: "tóc", x: 19, y: 49, ax: 48, ay: 6 },
      { term: "目", reading: "め", meaning: "mắt", x: 19, y: 76, ax: 49, ay: 13 },
      { term: "顔", reading: "かお", meaning: "mặt", x: 19, y: 103, ax: 49, ay: 19 },
      { term: "肩", reading: "かた", meaning: "vai", x: 19, y: 130, ax: 38, ay: 33 },
      { term: "腕", reading: "うで", meaning: "cánh tay", x: 19, y: 157, ax: 24, ay: 63 },
      { term: "手", reading: "て", meaning: "bàn tay", x: 19, y: 184, ax: 16, ay: 98 },
      { term: "指", reading: "ゆび", meaning: "ngón tay", x: 19, y: 211, ax: 10, ay: 105 },
      { term: "足", reading: "あし", meaning: "chân", x: 19, y: 238, ax: 39, ay: 190 },
      { term: "耳", reading: "みみ", meaning: "tai", x: 181, y: 22, ax: 61, ay: 16 },
      { term: "鼻", reading: "はな", meaning: "mũi", x: 181, y: 49, ax: 53, ay: 17 },
      { term: "口", reading: "くち", meaning: "miệng", x: 181, y: 76, ax: 53, ay: 21 },
      { term: "首", reading: "くび", meaning: "cổ", x: 181, y: 103, ax: 53, ay: 27 },
      { term: "背中", reading: "せなか", meaning: "lưng", x: 181, y: 130, ax: 67, ay: 40 },
      { term: "胸", reading: "むね", meaning: "ngực", x: 181, y: 157, ax: 58, ay: 45 },
      { term: "お腹", reading: "おなか", meaning: "bụng", x: 181, y: 184, ax: 53, ay: 73 },
      { term: "腰", reading: "こし", meaning: "hông, thắt lưng", x: 181, y: 211, ax: 53, ay: 85 },
      { term: "膝", reading: "ひざ", meaning: "đầu gối", x: 181, y: 238, ax: 66, ay: 132 },
    ],
  },
  {
    id: "organs",
    label: "Cơ thể (bên trong)",
    ja: "体の内側",
    jaReading: "からだのうちがわ",
    note: "Nội tạng và các bộ phận bên trong — vốn từ để nói với bác sĩ.",
    art: BODY_ART,
    pins: [
      { term: "脳", reading: "のう", meaning: "não", x: 19, y: 22, organ: "brain" },
      { term: "喉", reading: "のど", meaning: "họng, cổ họng", x: 19, y: 49, organ: "throat" },
      { term: "食道", reading: "しょくどう", meaning: "thực quản", x: 19, y: 76, organ: "esophagus" },
      { term: "肺", reading: "はい", meaning: "phổi", x: 19, y: 103, organ: "lung" },
      { term: "横隔膜", reading: "おうかくまく", meaning: "cơ hoành", x: 19, y: 130, organ: "diaphragm" },
      { term: "腎臓", reading: "じんぞう", meaning: "thận", x: 19, y: 157, organ: "kidney" },
      { term: "肝臓", reading: "かんぞう", meaning: "gan", x: 19, y: 184, organ: "liver" },
      { term: "大腸", reading: "だいちょう", meaning: "ruột già", x: 19, y: 211, organ: "colon" },
      { term: "筋肉", reading: "きんにく", meaning: "cơ, bắp thịt", x: 19, y: 238, organ: "muscle" },
      { term: "舌", reading: "した", meaning: "lưỡi", x: 181, y: 22, organ: "tongue" },
      { term: "心臓", reading: "しんぞう", meaning: "tim", x: 181, y: 49, organ: "heart" },
      { term: "血管", reading: "けっかん", meaning: "mạch máu (động mạch chủ)", x: 181, y: 76, organ: "aorta" },
      { term: "脾臓", reading: "ひぞう", meaning: "lá lách", x: 181, y: 103, organ: "spleen" },
      { term: "胃", reading: "い", meaning: "dạ dày", x: 181, y: 130, organ: "stomach" },
      { term: "膵臓", reading: "すいぞう", meaning: "tuyến tụy", x: 181, y: 157, organ: "pancreas" },
      { term: "小腸", reading: "しょうちょう", meaning: "ruột non", x: 181, y: 184, organ: "smallIntestine" },
      { term: "膀胱", reading: "ぼうこう", meaning: "bàng quang", x: 181, y: 211, organ: "bladder" },
      { term: "骨", reading: "ほね", meaning: "xương", x: 181, y: 238, organ: "bone" },
    ],
  },
  {
    id: "house",
    label: "Trong nhà",
    ja: "家の中",
    jaReading: "いえのなか",
    note: "Mặt cắt một căn nhà: từng phòng, từng bộ phận của nhà.",
    art: ROOM_ART,
    pins: [
      { term: "家", reading: "いえ", meaning: "nhà", x: 80, y: 14 },
      { term: "屋根", reading: "やね", meaning: "mái nhà", x: 110, y: 27 },
      { term: "天井", reading: "てんじょう", meaning: "trần nhà", x: 64, y: 44 },
      { term: "壁", reading: "かべ", meaning: "tường", x: 26, y: 58 },
      { term: "床", reading: "ゆか", meaning: "sàn nhà", x: 66, y: 74 },
      { term: "寝室", reading: "しんしつ", meaning: "phòng ngủ", x: 46, y: 48 },
      { term: "ベッド", reading: "べっど", meaning: "giường", x: 34, y: 66 },
      { term: "風呂", reading: "ふろ", meaning: "bồn tắm, nhà tắm", x: 88, y: 58 },
      { term: "洗面所", reading: "せんめんじょ", meaning: "chỗ rửa mặt", x: 100, y: 70 },
      { term: "トイレ", reading: "といれ", meaning: "nhà vệ sinh", x: 124, y: 52 },
      { term: "居間", reading: "いま", meaning: "phòng khách", x: 74, y: 100 },
      { term: "台所", reading: "だいどころ", meaning: "nhà bếp", x: 116, y: 84 },
      { term: "窓", reading: "まど", meaning: "cửa sổ", x: 62, y: 84 },
      { term: "ドア", reading: "どあ", meaning: "cửa", x: 30, y: 92 },
      { term: "玄関", reading: "げんかん", meaning: "cửa vào, chỗ để giày", x: 36, y: 106 },
      { term: "階段", reading: "かいだん", meaning: "cầu thang", x: 92, y: 104 },
      { term: "庭", reading: "にわ", meaning: "sân, vườn", x: 150, y: 104 },
    ],
  },
  {
    id: "kitchen",
    label: "Nhà bếp",
    ja: "台所",
    jaReading: "だいどころ",
    note: "Đứng trước bệ bếp: đồ điện, dụng cụ và bát đĩa.",
    art: ROOM_ART,
    pins: [
      { term: "食器棚", reading: "しょっきだな", meaning: "tủ bát đĩa", x: 18, y: 23 },
      { term: "皿", reading: "さら", meaning: "đĩa", x: 34, y: 28 },
      { term: "茶碗", reading: "ちゃわん", meaning: "bát (cơm)", x: 23, y: 42 },
      { term: "箸", reading: "はし", meaning: "đôi đũa", x: 48, y: 45 },
      { term: "電子レンジ", reading: "でんしれんじ", meaning: "lò vi sóng", x: 76, y: 36 },
      { term: "フライパン", reading: "ふらいぱん", meaning: "chảo", x: 104, y: 30 },
      { term: "蛇口", reading: "じゃぐち", meaning: "vòi nước", x: 27, y: 53 },
      { term: "流し", reading: "ながし", meaning: "bồn rửa", x: 38, y: 65 },
      { term: "包丁", reading: "ほうちょう", meaning: "dao (nhà bếp)", x: 63, y: 52 },
      { term: "まな板", reading: "まないた", meaning: "thớt", x: 62, y: 60 },
      { term: "鍋", reading: "なべ", meaning: "nồi", x: 80, y: 52 },
      { term: "コンロ", reading: "こんろ", meaning: "bếp (lò nấu)", x: 94, y: 66 },
      { term: "炊飯器", reading: "すいはんき", meaning: "nồi cơm điện", x: 112, y: 54 },
      { term: "冷蔵庫", reading: "れいぞうこ", meaning: "tủ lạnh", x: 144, y: 74 },
    ],
  },
  {
    id: "office",
    label: "Trong công ty",
    ja: "会社",
    jaReading: "かいしゃ",
    note: "Một tầng văn phòng: quầy tiếp tân, bàn làm việc và phòng họp.",
    art: ROOM_ART,
    pins: [
      { term: "受付", reading: "うけつけ", meaning: "quầy tiếp tân", x: 16, y: 62 },
      { term: "名刺", reading: "めいし", meaning: "danh thiếp", x: 36, y: 54 },
      { term: "時計", reading: "とけい", meaning: "đồng hồ", x: 20, y: 20 },
      { term: "同僚", reading: "どうりょう", meaning: "đồng nghiệp", x: 44, y: 51 },
      { term: "机", reading: "つくえ", meaning: "bàn làm việc", x: 74, y: 64 },
      { term: "パソコン", reading: "ぱそこん", meaning: "máy tính", x: 68, y: 50 },
      { term: "書類", reading: "しょるい", meaning: "giấy tờ, tài liệu", x: 91, y: 50 },
      { term: "電話", reading: "でんわ", meaning: "điện thoại", x: 89, y: 59 },
      { term: "印鑑", reading: "いんかん", meaning: "con dấu cá nhân", x: 102, y: 57 },
      { term: "椅子", reading: "いす", meaning: "ghế", x: 74, y: 86 },
      { term: "プリンター", reading: "ぷりんたー", meaning: "máy in", x: 105, y: 93 },
      { term: "会議室", reading: "かいぎしつ", meaning: "phòng họp", x: 130, y: 100 },
      { term: "ホワイトボード", reading: "ほわいとぼーど", meaning: "bảng trắng", x: 138, y: 26 },
      { term: "部長", reading: "ぶちょう", meaning: "trưởng phòng", x: 130, y: 46 },
    ],
  },
];

/** Cảnh theo id — id lạ (URL cũ, localStorage cũ) rơi về cảnh đầu tiên. */
export function sceneById(id: string): Scene {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}

/** Ghim có bộ phận thì hiện thành ô chú giải ở lề; không thì chỉ là chấm số. */
export function hasCallout(pin: ScenePin): boolean {
  return pin.organ != null;
}

/**
 * Điểm mà đường dẫn trỏ tới, theo toạ độ khung cảnh. Ghim gắn bộ phận thì lấy
 * tâm hộp bao của chính bộ phận đó — hình đổi thì neo đổi theo, không lệch.
 */
export function pinAnchor(pin: ScenePin): { x: number; y: number } | null {
  if (pin.ax != null && pin.ay != null) return figurePoint(pin.ax, pin.ay);
  if (!pin.organ) return null;
  const [x, y, w, h] = ORGANS[pin.organ].box;
  return figurePoint(x + w / 2, y + h / 2);
}

/**
 * Chỗ đường dẫn rời ô chú giải: mép trong của ô (phía quay về hình), chứ không
 * phải tâm ô — kẻo nét chui qua chính hình nhỏ trong ô.
 */
export function calloutEdge(scene: Scene, pin: ScenePin): { x: number; y: number } {
  const half = CALLOUT_W / 2;
  return { x: pin.x < scene.art.w / 2 ? pin.x + half : pin.x - half, y: pin.y };
}

/**
 * Phép biến hình đưa một bộ phận vào giữa ô chú giải của nó: co cho vừa ô
 * (chừa lề `pad`) rồi dời tâm hộp bao về tâm ô.
 */
export function calloutFit(pin: ScenePin, pad = 3): { x: number; y: number; scale: number } | null {
  if (!pin.organ) return null;
  const [x, y, w, h] = ORGANS[pin.organ].box;
  const scale = Math.min((CALLOUT_W - pad * 2) / w, (CALLOUT_H - pad * 2) / h);
  return { x: pin.x - (x + w / 2) * scale, y: pin.y - (y + h / 2) * scale, scale };
}

/**
 * Vị trí ghim đổi sang phần trăm để đặt bằng CSS lên trên tranh. Ghim có ô chú
 * giải nhận luôn kích thước ô, để vùng bấm trùm đúng hình nhỏ.
 */
export function pinStyle(scene: Scene, pin: ScenePin): Record<string, string> {
  const style: Record<string, string> = {
    left: `${(pin.x / scene.art.w) * 100}%`,
    top: `${(pin.y / scene.art.h) * 100}%`,
  };
  if (hasCallout(pin)) {
    style.width = `${(CALLOUT_W / scene.art.w) * 100}%`;
    style.height = `${(CALLOUT_H / scene.art.h) * 100}%`;
  }
  return style;
}

/**
 * Nhãn nằm bên nào của ghim: ghim ở nửa phải thì nhãn đổ về bên trái, kẻo chữ
 * tràn khỏi khung tranh.
 */
export function pinSide(scene: Scene, pin: ScenePin): "left" | "right" {
  return pin.x > scene.art.w * 0.62 ? "left" : "right";
}
