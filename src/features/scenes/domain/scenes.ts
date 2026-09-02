// Từ vựng theo khung cảnh (#294): mỗi cảnh là một bức tranh nét (SVG) kèm các
// "ghim" đặt đúng chỗ vật đó nằm trong tranh — học 冷蔵庫 bằng cách thấy nó
// đứng ở đâu trong bếp, thay vì đọc một danh sách phẳng.
//
// Phần này THUẦN dữ liệu + toạ độ: tranh vẽ ở `ui/SceneArt.tsx` đọc cùng hệ
// toạ độ này nên ghim và hình luôn khớp nhau. Không phụ thuộc React/DOM.

/** Khung vẽ dùng chung cho mọi cảnh (đơn vị SVG) — ghim tính theo hệ này. */
export const ART_W = 160;
export const ART_H = 120;

export type SceneId = "body" | "organs" | "house" | "kitchen" | "office";

export interface ScenePin {
  /** Mặt chữ Nhật. */
  term: string;
  /** Cách đọc (kana) — dùng cho furigana và cho giọng đọc. */
  reading: string;
  /** Nghĩa tiếng Việt. */
  meaning: string;
  /** Vị trí chấm số trong khung ART_W × ART_H. */
  x: number;
  y: number;
  /**
   * Điểm mà chấm số trỏ tới, nếu chấm không nằm ngay trên vật. Cảnh cơ thể có
   * cả chục bộ phận chen trong một vùng nhỏ (mắt, mũi, miệng, tai) nên chấm xếp
   * thành hai cột ở lề và nối vào thân bằng một đường dẫn — lối chú giải của
   * hình giải phẫu. Cảnh phòng ốc thì vật đủ rộng, chấm đặt thẳng lên vật.
   */
  ax?: number;
  ay?: number;
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
  pins: ScenePin[];
}

// Toạ độ ghim đặt tay theo hình ở SceneArt: sửa hình thì sửa cả toạ độ ở đây.
export const SCENES: Scene[] = [
  {
    id: "body",
    label: "Cơ thể (bên ngoài)",
    ja: "体の外側",
    jaReading: "からだのそとがわ",
    note: "Những bộ phận nhìn thấy được — đi khám, đi tiệm, tả người đều cần.",
    pins: [
      { term: "頭", reading: "あたま", meaning: "đầu", x: 26, y: 12, ax: 76, ay: 12 },
      { term: "髪", reading: "かみ", meaning: "tóc", x: 26, y: 24, ax: 70, ay: 16 },
      { term: "目", reading: "め", meaning: "mắt", x: 26, y: 36, ax: 75, ay: 22 },
      { term: "顔", reading: "かお", meaning: "mặt", x: 26, y: 48, ax: 71, ay: 31 },
      { term: "肩", reading: "かた", meaning: "vai", x: 26, y: 60, ax: 62, ay: 43 },
      { term: "腕", reading: "うで", meaning: "cánh tay", x: 26, y: 72, ax: 51, ay: 66 },
      { term: "手", reading: "て", meaning: "bàn tay", x: 26, y: 84, ax: 45, ay: 93 },
      { term: "指", reading: "ゆび", meaning: "ngón tay", x: 26, y: 98, ax: 44, ay: 101 },
      { term: "足", reading: "あし", meaning: "chân", x: 26, y: 110, ax: 72, ay: 114 },
      { term: "耳", reading: "みみ", meaning: "tai", x: 134, y: 12, ax: 92, ay: 25 },
      { term: "鼻", reading: "はな", meaning: "mũi", x: 134, y: 24, ax: 80, ay: 26 },
      { term: "口", reading: "くち", meaning: "miệng", x: 134, y: 36, ax: 80, ay: 31 },
      { term: "首", reading: "くび", meaning: "cổ", x: 134, y: 48, ax: 80, ay: 38 },
      { term: "胸", reading: "むね", meaning: "ngực", x: 134, y: 60, ax: 80, ay: 52 },
      { term: "背中", reading: "せなか", meaning: "lưng", x: 134, y: 72, ax: 99, ay: 58 },
      { term: "お腹", reading: "おなか", meaning: "bụng", x: 134, y: 84, ax: 80, ay: 70 },
      { term: "腰", reading: "こし", meaning: "hông, thắt lưng", x: 134, y: 96, ax: 80, ay: 82 },
      { term: "膝", reading: "ひざ", meaning: "đầu gối", x: 134, y: 108, ax: 88, ay: 99 },
    ],
  },
  {
    id: "organs",
    label: "Cơ thể (bên trong)",
    ja: "体の内側",
    jaReading: "からだのうちがわ",
    note: "Nội tạng và các bộ phận bên trong — vốn từ để nói với bác sĩ.",
    pins: [
      { term: "脳", reading: "のう", meaning: "não", x: 26, y: 14, ax: 78, ay: 19 },
      { term: "舌", reading: "した", meaning: "lưỡi", x: 26, y: 28, ax: 84, ay: 31 },
      { term: "喉", reading: "のど", meaning: "họng, cổ họng", x: 26, y: 42, ax: 80, ay: 38 },
      { term: "心臓", reading: "しんぞう", meaning: "tim", x: 26, y: 56, ax: 80, ay: 50 },
      { term: "肺", reading: "はい", meaning: "phổi", x: 26, y: 70, ax: 69, ay: 54 },
      { term: "筋肉", reading: "きんにく", meaning: "cơ, bắp thịt", x: 26, y: 84, ax: 50, ay: 64 },
      { term: "胃", reading: "い", meaning: "dạ dày", x: 26, y: 98, ax: 73, ay: 66 },
      { term: "血", reading: "ち", meaning: "máu", x: 26, y: 112, ax: 46, ay: 94 },
      { term: "肝臓", reading: "かんぞう", meaning: "gan", x: 134, y: 28, ax: 88, ay: 63 },
      { term: "腎臓", reading: "じんぞう", meaning: "thận", x: 134, y: 45, ax: 92, ay: 72 },
      { term: "骨", reading: "ほね", meaning: "xương", x: 134, y: 62, ax: 111, ay: 68 },
      { term: "腸", reading: "ちょう", meaning: "ruột", x: 134, y: 79, ax: 80, ay: 79 },
      { term: "血管", reading: "けっかん", meaning: "mạch máu", x: 134, y: 96, ax: 113, ay: 90 },
      { term: "神経", reading: "しんけい", meaning: "dây thần kinh", x: 134, y: 113, ax: 87, ay: 105 },
    ],
  },
  {
    id: "house",
    label: "Trong nhà",
    ja: "家の中",
    jaReading: "いえのなか",
    note: "Mặt cắt một căn nhà: từng phòng, từng bộ phận của nhà.",
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

/** Vị trí ghim đổi sang phần trăm để đặt bằng CSS lên trên tranh. */
export function pinStyle(pin: ScenePin): { left: string; top: string } {
  return { left: `${(pin.x / ART_W) * 100}%`, top: `${(pin.y / ART_H) * 100}%` };
}

/**
 * Nhãn nằm bên nào của ghim: ghim ở nửa phải thì nhãn đổ về bên trái, kẻo chữ
 * tràn khỏi khung tranh.
 */
export function pinSide(pin: ScenePin): "left" | "right" {
  return pin.x > ART_W * 0.62 ? "left" : "right";
}
