// Tranh nét cho từng cảnh — vẽ bằng SVG ngay trong code (không tải ảnh): chạy
// offline, đổi theme là đổi màu theo token, và phóng to bao nhiêu cũng nét.
//
// Lối vẽ theo DESIGN.md §1 (washi/sumi): nét mực `currentColor`, khối tô bằng
// color-mix rất nhạt (class ở scenes.css), không đổ bóng, không gradient.
//
// Hai cảnh cơ thể dựng theo lối *hình giải phẫu*: thân người ở giữa, hai cột ô
// chú giải ở lề, mỗi ô là hình nhỏ của chính bộ phận đó và một đường dẫn nối
// vào đúng chỗ trên thân — nhìn ô là đoán được từ, không phải dò số.

import { CALLOUT_H, CALLOUT_W, calloutEdge, hasCallout, Scene, SceneId } from "../domain/scenes";

/**
 * Bóng người nhìn chính diện trong khung dọc BODY_ART — cảnh "bên ngoài" vẽ
 * đậm, cảnh "bên trong" vẽ mờ làm khung cho nội tạng, nên tách ra dùng lại.
 */
function BodySilhouette({ faint }: { faint?: boolean }) {
  return (
    <g className={faint ? "art-faint" : undefined}>
      {/* tóc: một vòm phủ đỉnh đầu */}
      <path className="art-fill-ink" d="M66 24a14 14 0 0 1 28 0q-6-9-14-9t-14 9z" />
      <ellipse className="art-fill-soft" cx="80" cy="26" rx="12" ry="14.5" />
      {/* hai tai */}
      <ellipse className="art-fill-soft" cx="67" cy="27" rx="2.5" ry="4" />
      <ellipse className="art-fill-soft" cx="93" cy="27" rx="2.5" ry="4" />
      {/* cổ */}
      <path className="art-fill-soft" d="M74.5 37h11v13h-11z" />
      {/* thân: vai đổ xuống, thắt ở eo, loe ra ở hông */}
      <path className="art-fill-soft" d="M57 50q23-8 46 0l-9 46 3 20H63l3-20z" />
      {/* hai tay: dải thuôn dần, không phải que */}
      <path className="art-fill-soft" d="M58 50 48 86l-4 33h6l4-32 9-31z" />
      <path className="art-fill-soft" d="M102 50l10 36 4 33h-6l-4-32-9-31z" />
      <ellipse className="art-fill-soft" cx="46" cy="126" rx="4.5" ry="7" />
      <ellipse className="art-fill-soft" cx="114" cy="126" rx="4.5" ry="7" />
      {/* hai chân và bàn chân */}
      <path className="art-fill-soft" d="M64 116h14l-2 76H66z" />
      <path className="art-fill-soft" d="M82 116h14l-2 76H84z" />
      <ellipse className="art-fill-soft" cx="70" cy="193" rx="7" ry="3.5" />
      <ellipse className="art-fill-soft" cx="90" cy="193" rx="7" ry="3.5" />
    </g>
  );
}

function BodyArt() {
  return (
    <>
      <BodySilhouette />
      {/* nét mặt: mắt, mũi, miệng — đủ để ghim 目/鼻/口 có chỗ trỏ tới */}
      <circle className="art-fill-ink" cx="75" cy="25" r="1.4" />
      <circle className="art-fill-ink" cx="85" cy="25" r="1.4" />
      <path d="M80 26v5" />
      <path d="M76 34.5q4 3 8 0" />
      {/* khớp vai, eo, ngón tay và đầu gối — chỗ neo của các ghim tương ứng */}
      <path className="art-faint" d="M61 55q6-4 9 1M99 55q-6-4-9 1" />
      <path className="art-faint" d="M66 96h28" />
      <path className="art-faint" d="M43.5 130v4M46 131v4M48.5 130v4" />
      <path className="art-faint" d="M111.5 130v4M114 131v4M116.5 130v4" />
      <path className="art-faint" d="M67 155h9M84 155h9" />
    </>
  );
}

function OrgansArt() {
  return (
    <>
      <BodySilhouette faint />
      {/* não */}
      <ellipse className="art-fill-accent" cx="80" cy="20" rx="10" ry="7.5" />
      <path d="M71 18q2.5-3.5 5 0t5 0 5 0M71 23q2.5-3.5 5 0t5 0 5 0" />
      {/* lưỡi trong khoang miệng */}
      <path className="art-fill-seal" d="M76 31q4-1 8 0 1 6-4 8t-4-8z" />
      {/* thanh quản + khí quản có ngấn, chia hai nhánh vào phổi */}
      <path className="art-fill-accent" d="M77 40h6v16h-6z" />
      <path d="M77 44h6M77 48h6M77 52h6" />
      <path d="M80 56q-4 2-6 6M80 56q4 2 6 6" />
      {/* hai lá phổi */}
      <ellipse className="art-fill-accent" cx="70" cy="66" rx="8" ry="11" />
      <ellipse className="art-fill-accent" cx="90" cy="66" rx="8" ry="11" />
      {/* tim lệch sang trái người, tức bên phải người xem */}
      <path className="art-fill-seal" d="M78 55q1-4 5-4 3 0 4 2 2-3 5-1 4 2 2 7-3 6-9 8-8-5-7-12z" />
      {/* cơ hoành: vạch chia lồng ngực với ổ bụng */}
      <path className="art-faint" d="M64 78q16 5 32 0" />
      {/* gan bên phải người (trái người xem), dạ dày bên kia */}
      <path className="art-fill-accent" d="M63 80q9-3 16 1-1 7-7 8-8 1-10-3z" />
      <path className="art-fill-accent" d="M84 79q4-2 6 2 3 6-1 9t-7-2 2-9z" />
      {/* hai quả thận */}
      <path className="art-fill-accent" d="M69 90q4 0 4 5t-4 5q-3 0-3-2.5 0-2-2-2.5 2-.5 2-2.5 0-2.5 3-2.5z" />
      <path className="art-fill-accent" d="M91 90q-4 0-4 5t4 5q3 0 3-2.5 0-2 2-2.5-2-.5-2-2.5 0-2.5-3-2.5z" />
      {/* ruột: đại tràng vòng ngoài, ruột non cuộn bên trong */}
      <path className="art-fill-accent" d="M67 117v-12q0-4 4-4h18q4 0 4 4v12h-4v-10q0-1-1-1H72q-1 0-1 1v10z" />
      <path d="M74 108q3-3 6 0t6 0M74 112q3-3 6 0t6 0M74 116q3-3 6 0t6 0" />
      {/* xương cánh tay và khung chậu */}
      <path className="art-faint" d="M103 52l9 34 4 31" />
      <path className="art-faint" d="M66 116h28" />
      {/* bắp tay, động mạch xuống bàn tay, mạch máu tay phải, thần kinh chân */}
      <path d="M50 62q7 5 4 14" />
      <path className="art-stroke-seal" d="M60 56 51 88l-4 30" />
      <path className="art-stroke-seal" d="M110 104l5 14M112 110l-4 5" />
      <path className="art-faint" d="M88 120v72" />
    </>
  );
}

function HouseArt() {
  return (
    <>
      {/* mặt đất và mái */}
      <path d="M2 112h156" />
      <path className="art-fill-ink" d="M16 41 80 9l64 32z" />
      {/* khối nhà, sàn giữa hai tầng, vách chia phòng */}
      <path className="art-fill-soft" d="M24 41h112v71H24z" />
      <path d="M24 76h112" />
      <path d="M76 41v35M108 41v35M52 76v36M96 76v36" />
      {/* tầng trên: giường (寝室), bồn tắm + chỗ rửa mặt, bồn cầu */}
      <path className="art-fill-accent" d="M30 62h22v10H30z" />
      <path d="M30 62h6v10h-6" />
      <path className="art-fill-accent" d="M80 60h20v10H80z" />
      <path d="M96 70h8" />
      <path className="art-fill-accent" d="M116 56h10v8h-10z" />
      <path d="M118 64h6v6h-6z" />
      {/* tầng dưới: cửa vào, cửa sổ, sofa, bệ bếp, cầu thang */}
      <path className="art-fill-accent" d="M28 88h16v24H28z" />
      <circle className="art-fill-ink" cx="41" cy="100" r="1.2" />
      <path className="art-fill-accent" d="M56 80h14v10H56z" />
      <path d="M63 80v10M56 85h14" />
      <path className="art-fill-accent" d="M58 98h20v8H58z" />
      <path d="M58 98v-5h20v5" />
      <path className="art-fill-accent" d="M100 84h24v6h-24z" />
      <path d="M100 90v22M112 90v22" />
      <path d="M84 112v-6h4v-6h4v-6h4v-6" />
      {/* cây trong sân */}
      <path d="M150 112v-8" />
      <circle className="art-fill-accent" cx="150" cy="99" r="6" />
    </>
  );
}

function KitchenArt() {
  return (
    <>
      <path d="M2 106h156" />
      {/* tủ bát đĩa treo tường: đĩa dựng, bát, đũa */}
      <path className="art-fill-soft" d="M14 20h40v30H14z" />
      <path d="M14 36h40" />
      <circle className="art-fill-accent" cx="24" cy="29" r="5" />
      <circle className="art-fill-accent" cx="35" cy="29" r="5" />
      <circle className="art-fill-accent" cx="46" cy="29" r="5" />
      <path className="art-fill-accent" d="M18 40q4 7 9 0z M30 40q4 7 9 0z" />
      <path d="M45 48l3-8M48 48l3-8" />
      {/* lò vi sóng và chảo treo */}
      <path className="art-fill-soft" d="M60 24h32v22H60z" />
      <path d="M64 28h20v14H64z" />
      <circle className="art-fill-ink" cx="88" cy="31" r="1.2" />
      <circle className="art-fill-accent" cx="104" cy="32" r="8" />
      <path d="M110 27l8-6" />
      {/* bệ bếp: mặt bệ, thân tủ, cánh */}
      <path className="art-fill-soft" d="M14 62h108v6H14z" />
      <path className="art-fill-soft" d="M16 68h104v36H16z" />
      <path d="M68 68v36" />
      <path d="M16 80h104" />
      <path d="M34 74h16M86 74h16" />
      {/* bồn rửa và vòi */}
      <ellipse className="art-fill-accent" cx="34" cy="65" rx="13" ry="3" />
      <circle className="art-fill-ink" cx="34" cy="65" r="1.2" />
      <path d="M22 62V52q0-4 4-4h8v4" />
      {/* thớt và dao */}
      <path className="art-fill-accent" d="M52 57h20v5H52z" />
      <path d="M56 55h14v-2l-14 1z" />
      <path d="M70 54h4" />
      {/* bếp hai lò + núm điều khiển, nồi trên lò */}
      <circle cx="80" cy="64" r="5" />
      <circle cx="94" cy="64" r="5" />
      <circle className="art-fill-ink" cx="82" cy="74" r="1.4" />
      <circle className="art-fill-ink" cx="92" cy="74" r="1.4" />
      <path className="art-fill-accent" d="M72 50h16l-2 12H74z" />
      <path d="M72 50h16M78 47h4" />
      {/* nồi cơm điện */}
      <path className="art-fill-accent" d="M102 48h18v14h-18z" />
      <path d="M102 53h18" />
      <circle className="art-fill-ink" cx="117" cy="58" r="1.2" />
      {/* tủ lạnh: hai khoang, tay nắm */}
      <path className="art-fill-soft" d="M128 34h30v70h-30z" />
      <path d="M128 58h30" />
      <path d="M152 44v10M152 64v12" />
    </>
  );
}

function OfficeArt() {
  return (
    <>
      <path d="M2 110h156" />
      {/* đồng hồ tường */}
      <circle className="art-fill-soft" cx="20" cy="20" r="7" />
      <path d="M20 20v-4M20 20l3 2" />
      {/* vách kính chia phòng họp, chừa lối cửa */}
      <path d="M114 8v62M114 90v20M117 8v62M117 90v20" />
      {/* quầy tiếp tân + người tiếp tân + kệ danh thiếp */}
      <path className="art-fill-soft" d="M6 58h34v8H6z" />
      <path className="art-fill-soft" d="M8 66h30v38H8z" />
      <path className="art-fill-accent" d="M32 54h6v4h-6z" />
      <path className="art-fill-accent" d="M12 48h12v10H12z" />
      <circle className="art-fill-accent" cx="28" cy="55" r="2.5" />
      {/* đồng nghiệp đứng cạnh bàn */}
      <circle className="art-fill-accent" cx="44" cy="51" r="5" />
      <path d="M38 62q2-6 6-6t6 6l-1 14h-10z" />
      {/* bàn làm việc + chân bàn */}
      <path className="art-fill-soft" d="M52 62h48v6H52z" />
      <path d="M58 68v36M94 68v36" />
      {/* máy tính, giấy tờ, điện thoại, con dấu trên bàn */}
      <path className="art-fill-accent" d="M58 44h20v16H58z" />
      <path d="M62 62h12M68 60v2" />
      <path className="art-fill-accent" d="M84 48h14v7H84z" />
      <path d="M86 46h14v7M88 44h14v7" />
      <path className="art-fill-accent" d="M84 56h12v6H84z" />
      <path d="M86 56q3-3 6 0" />
      <path className="art-fill-seal" d="M100 54h4v8h-4z" />
      {/* ghế xoay trước bàn */}
      <path className="art-fill-accent" d="M62 76h24v5H62z" />
      <path className="art-fill-accent" d="M80 62h5v14h-5z" />
      <path d="M74 81v11" />
      <path d="M65 94h18" />
      <circle cx="66" cy="96" r="2" />
      <circle cx="82" cy="96" r="2" />
      {/* máy in */}
      <path className="art-fill-soft" d="M98 82h14v22H98z" />
      <path d="M98 88h14M100 96h10" />
      {/* phòng họp: bảng trắng, bàn họp, ghế, trưởng phòng */}
      <path className="art-fill-soft" d="M122 14h32v24h-32z" />
      <path d="M124 40h28" />
      <path d="M126 20h16M126 26h20" />
      <ellipse className="art-fill-accent" cx="138" cy="60" rx="18" ry="7" />
      <path className="art-fill-accent" d="M144 46h8v5h-8zM136 72h8v5h-8z" />
      <circle className="art-fill-accent" cx="130" cy="46" r="4" />
      <path d="M125 56q1-6 5-6t5 6" />
    </>
  );
}

const ARTS: Record<SceneId, () => JSX.Element> = {
  body: BodyArt,
  organs: OrgansArt,
  house: HouseArt,
  kitchen: KitchenArt,
  office: OfficeArt,
};

/**
 * Hình nhỏ trong ô chú giải, vẽ quanh gốc toạ độ và gói trong ±12 × ±7.5 để
 * vừa ô CALLOUT_W × CALLOUT_H. Khoá là mặt chữ Nhật của ghim; thiếu hình thì ô
 * chỉ còn con số, không vỡ gì.
 */
const GLYPHS: Record<string, () => JSX.Element> = {
  頭: () => (
    <>
      <circle className="art-fill-soft" cx="0" cy="0.5" r="6.4" />
      <path className="art-fill-ink" d="M-6.4-0.5a6.4 6.4 0 0 1 12.8 0q-3-4.5-6.4-4.5t-6.4 4.5z" />
      <circle className="art-fill-ink" cx="-2.3" cy="0.6" r="0.8" />
      <circle className="art-fill-ink" cx="2.3" cy="0.6" r="0.8" />
      <path d="M-2 3.6q2 1.6 4 0" />
    </>
  ),
  髪: () => (
    <>
      <ellipse className="art-fill-soft" cx="0" cy="1" rx="5.5" ry="6.5" />
      <path className="art-fill-ink" d="M-6-1a6 6.5 0 0 1 12 0q-1-4-6-4t-6 4z" />
      <path className="art-fill-ink" d="M-6-1q-2 6-1 9l-2.6.6q-1.6-5 .6-10z" />
      <path className="art-fill-ink" d="M6-1q2 6 1 9l2.6.6q1.6-5-.6-10z" />
    </>
  ),
  目: () => (
    <>
      <path className="art-fill-soft" d="M-9 0q9-6.5 18 0-9 6.5-18 0z" />
      <circle className="art-fill-accent" cx="0" cy="0" r="3.2" />
      <circle className="art-fill-ink" cx="0" cy="0" r="1.3" />
      <path className="art-faint" d="M-8-3.5q8-3 16 0" />
    </>
  ),
  顔: () => (
    <>
      <ellipse className="art-fill-soft" cx="0" cy="0" rx="5.6" ry="7.2" />
      <path className="art-faint" d="M-4-3.6q1.6-1.2 3 0M1-3.6q1.4-1.2 3 0" />
      <circle className="art-fill-ink" cx="-2.2" cy="-1.4" r="0.8" />
      <circle className="art-fill-ink" cx="2.2" cy="-1.4" r="0.8" />
      <path d="M0-0.8v2.6M-2 4.4q2 1.6 4 0" />
    </>
  ),
  肩: () => (
    <>
      <path className="art-fill-soft" d="M-3-7.5h6v3.5q8 1 10 8h-26q2-7 10-8z" />
      <circle className="art-fill-accent" cx="-8" cy="1.5" r="3.2" />
      <path d="M-4-3q4 2 8 0" />
    </>
  ),
  腕: () => (
    <>
      <circle className="art-fill-soft" cx="-8.5" cy="-4.5" r="3.4" />
      <path className="art-fill-soft" d="M-10-6.5q4-2 6 1.5l4 6.5 5.5 1.5q2.5.5 2 2.5t-3 1.5l-6.5-2q-2.5-.8-4-3l-4-6.5z" />
      <ellipse className="art-fill-soft" cx="7" cy="5" rx="3.2" ry="2.6" />
      <path className="art-faint" d="M-4-2.5q2.5 2 1.5 4.5" />
    </>
  ),
  手: () => (
    <g transform="translate(-1.5 0) scale(0.78)">
      <path
        className="art-fill-soft"
        d="M-5 9q-3-4-3-8v-3q0-2 2-2t2 2v2h1v-6q0-2 2-2t2 2v4h1v-7q0-2 2-2t2 2v5h1v-4q0-2 2-2t2 2v6q0 6-3 9z"
      />
      <path className="art-faint" d="M-4 2h9" />
    </g>
  ),
  指: () => (
    <>
      <path className="art-fill-soft" d="M-3.2 7.5V-4a3.2 3.2 0 0 1 6.4 0V7.5z" />
      <ellipse className="art-fill-ink" cx="0" cy="-2.4" rx="1.9" ry="2.4" />
      <path className="art-faint" d="M-3.2 2h6.4M-3.2 5h6.4" />
    </>
  ),
  足: () => (
    <>
      <path className="art-fill-soft" d="M-3.6-7.5h7.2l-1 7-.6 5.5h-4l-.6-5.5z" />
      <ellipse className="art-fill-soft" cx="0" cy="6" rx="4.6" ry="2.3" />
      <path className="art-faint" d="M-3-1h6" />
    </>
  ),
  耳: () => (
    <>
      <path className="art-fill-soft" d="M0-7.5a5.5 7.5 0 0 1 0 15q-3.5 0-3.5-3.5l1.5-3.5z" />
      <path d="M-0.5-3.8a3.4 3.8 0 0 1 0 7.2" />
      <path d="M0 0.6a1.5 1.5 0 0 1 0 2.8" />
    </>
  ),
  鼻: () => (
    <>
      <path className="art-fill-soft" d="M0-7.5q2 6.5 4.5 8.5 1 4.5-4.5 4.5t-4.5-4.5q2.5-2 4.5-8.5z" />
      <circle className="art-fill-ink" cx="-2.2" cy="3.4" r="1.1" />
      <circle className="art-fill-ink" cx="2.2" cy="3.4" r="1.1" />
    </>
  ),
  口: () => (
    <>
      <path className="art-fill-seal" d="M-9.5 0q4.5-5.5 9.5-2.2 5-3.3 9.5 2.2-4.5 6.5-9.5 6.5t-9.5-6.5z" />
      <path d="M-9.5 0q9.5 3 19 0" />
    </>
  ),
  首: () => (
    <>
      <path className="art-fill-soft" d="M-7-8q0 5 7 5t7-5z" />
      <path className="art-fill-soft" d="M-3.6-3.5h7.2v6h-7.2z" />
      <path className="art-fill-soft" d="M-10 7.5q2-5 6.5-5.5h7q4.5.5 6.5 5.5z" />
      <path className="art-faint" d="M-3.6 0q3.6 1.6 7.2 0" />
    </>
  ),
  胸: () => (
    <>
      <path className="art-fill-soft" d="M-9-7q9-2.5 18 0l-1.5 7q-1 4-7.5 6-6.5-2-7.5-6z" />
      <path d="M0-7v13" />
      <path d="M-8-3.5q8 2.5 16 0M-7 0q7 2.5 14 0M-5.5 3.5q5.5 2.5 11 0" />
    </>
  ),
  背中: () => (
    <>
      <path className="art-fill-soft" d="M-9-7q9-3 18 0l-2 14h-14z" />
      <path d="M0-6v12" />
      <circle className="art-fill-ink" cx="0" cy="-3" r="1" />
      <circle className="art-fill-ink" cx="0" cy="0.5" r="1" />
      <circle className="art-fill-ink" cx="0" cy="4" r="1" />
      <path className="art-faint" d="M-6-3q3 3 0 6M6-3q-3 3 0 6" />
    </>
  ),
  お腹: () => (
    <>
      <path className="art-fill-soft" d="M-9-6.5q9-2 18 0 2 6.5 0 13-9 2-18 0-2-6.5 0-13z" />
      <circle className="art-fill-ink" cx="0" cy="0.5" r="1.7" />
      <path className="art-faint" d="M-5-3.5h10M-5 4.5h10" />
    </>
  ),
  腰: () => (
    <>
      <path className="art-fill-soft" d="M-7-7.5h14l3 15h-20z" />
      <path className="art-fill-ink" d="M-8.4-1.5h16.8v3.4h-16.8z" />
      <circle className="art-fill-accent" cx="0" cy="0.2" r="1.4" />
    </>
  ),
  膝: () => (
    <>
      <path className="art-fill-soft" d="M-6.5-7.5h6v6q0 3 3 4l6 2.5v3.5l-9-3q-6-2-6-8z" />
      <ellipse className="art-fill-accent" cx="-0.5" cy="0.5" rx="3.4" ry="3" />
    </>
  ),
  脳: () => (
    <>
      <path
        className="art-fill-accent"
        d="M-8.5-1q-1-4 2-5 0-3 3.5-2.5 1.5-2.5 3-1 1.5-1.5 3 1 3.5-.5 3.5 2.5 3 1 2 5 .5 5-4 5.5h-7q-4.5-.5-4-5.5z"
      />
      <path d="M0-6.5v10M-4.5-4q2 2 0 4t1 3.5M4.5-4q-2 2 0 4t-1 3.5" />
      <path className="art-fill-ink" d="M-1.5 4h3v3.5h-3z" />
    </>
  ),
  舌: () => (
    <>
      <path className="art-fill-ink" d="M-9-5q9-4 18 0-2 3.5-9 3.5t-9-3.5z" />
      <path className="art-fill-seal" d="M-4-3q4-1 8 0 1 6.5-4 9.5t-4-9.5z" />
      <path className="art-faint" d="M0-1v5" />
    </>
  ),
  喉: () => (
    <>
      <path className="art-fill-soft" d="M-5-7.5q5-2 10 0v4q-5 2-10 0z" />
      <path className="art-fill-accent" d="M-4-2.5h8v10h-8z" />
      <path d="M-4 0h8M-4 2.5h8M-4 5h8" />
    </>
  ),
  肺: () => (
    <>
      <path d="M0-7.5v4.5M0-3q-3 1-4.5 3M0-3q3 1 4.5 3" />
      <path className="art-fill-accent" d="M-1.5-2.5q-8 2-8 7t3.5 4 4.5-5z" />
      <path className="art-fill-accent" d="M1.5-2.5q8 2 8 7t-3.5 4-4.5-5z" />
    </>
  ),
  筋肉: () => (
    <g transform="translate(1 1) scale(0.85)">
      {/* cẳng tay gập lên + nắm tay; bắp tay vẽ sau nên phủ lên chỗ nối */}
      <path className="art-fill-soft" d="M-1-6h5.5v10H-1z" />
      <circle className="art-fill-soft" cx="1.75" cy="-7" r="2.8" />
      <path className="art-fill-soft" d="M-11 6q-1-6 3-8 4-2 7 1 3 3 3 6 0 3-3 3h-7q-3 0-3-2z" />
      <path d="M-7 1q3-2 5 1" />
    </g>
  ),
  肝臓: () => (
    <>
      <path className="art-fill-accent" d="M-11-4.5q6-3 11-1.5 5 1.5 11-1-1 8-6 11-8 4-13-1-3.5-3.5-3-7.5z" />
      <path d="M0-6v9" />
      <ellipse className="art-fill-seal" cx="4" cy="4.5" rx="2.6" ry="1.8" />
    </>
  ),
  血: () => (
    <>
      <path className="art-fill-seal" d="M0-8q7 8 7 12a7 7 0 0 1-14 0q0-4 7-12z" />
      <path className="art-faint" d="M-3.5 3.5a3.5 3.5 0 0 1 3.5-3.5" />
    </>
  ),
  心臓: () => (
    <>
      <path className="art-fill-seal" d="M-7-1q0-5 4.5-5 3 0 4 2.5 2-3 5-1 4.5 2.5 2 7.5-3 6-9 8.5-7-5-6.5-12.5z" />
      <path d="M-2.5-6V-8.5M2-5.5l1.5-3M8-2q2.5-2 3.5-5" />
    </>
  ),
  骨: () => (
    <>
      <circle className="art-fill-soft" cx="-6.5" cy="-3.2" r="3.3" />
      <circle className="art-fill-soft" cx="-6.5" cy="3.2" r="3.3" />
      <circle className="art-fill-soft" cx="6.5" cy="-3.2" r="3.3" />
      <circle className="art-fill-soft" cx="6.5" cy="3.2" r="3.3" />
      {/* thân xương tô đè lên nét của bốn khớp, rồi kẻ lại hai cạnh dài */}
      <rect className="art-fill-soft" x="-6.5" y="-2.4" width="13" height="4.8" stroke="none" />
      <path d="M-6.5-2.4h13M-6.5 2.4h13" />
    </>
  ),
  胃: () => (
    <>
      <path className="art-fill-accent" d="M-5-8q3 3 3 5.5 6 1 7 6t-5 4.5q-7 0-8-6-1-6 3-10z" />
      <path d="M-5-8q2-.5 3.5.5" />
      <path className="art-fill-accent" d="M5 7.5q3 1 3.5 3l-2.5 1q-.5-1.5-2.5-2z" />
    </>
  ),
  腎臓: () => (
    <g transform="translate(-1 0)">
      <path className="art-fill-accent" d="M1-8q7 0 7 8t-7 8q-5 0-5-4 0-3-4-4 4-1 4-4t5-4z" />
      <path className="art-faint" d="M-4 0h5" />
    </g>
  ),
  腸: () => (
    <>
      <path className="art-fill-accent" d="M-10 7.5v-11.5q0-4 4-4h12q4 0 4 4v11.5h-4v-10q0-1-1-1h-10q-1 0-1 1v10z" />
      <path d="M-5 0q5-3 10 0M-5 3.5q5-3 10 0M-5 7q5-3 10 0" />
    </>
  ),
  血管: () => (
    <>
      <path className="art-fill-seal" d="M-11-4h14l7-3.5v4l-5 3.5 5 3.5v4l-7-3.5h-14z" />
      <path className="art-faint" d="M-11 0h13" />
    </>
  ),
  神経: () => (
    <>
      <circle className="art-fill-accent" cx="-6" cy="0" r="4" />
      <path d="M-9.5-3l-2.5-3M-9.5 3l-2.5 3M-6-4.2v-3.3M-6 4.2v3.3" />
      <path d="M-2 0h2" />
      <path className="art-fill-accent" d="M0-2h4v4H0zM5-2h4v4H5z" />
      <path d="M9 0h3M12 0l-2-2M12 0l-2 2" />
    </>
  ),
};

/**
 * Lớp chú giải kiểu hình giải phẫu: ô ở lề + đường dẫn vào điểm neo trên thân.
 * Cảnh phòng ốc không có ghim nào mang neo nên lớp này rỗng, không vẽ gì.
 */
function Callouts({ scene, active }: { scene: Scene; active: number | null }) {
  return (
    <>
      {scene.pins.map((pin, i) => {
        if (!hasCallout(pin)) return null;
        const edge = calloutEdge(scene, pin);
        const Glyph = GLYPHS[pin.term];
        return (
          <g key={pin.term} className={`callout${i === active ? " active" : ""}`}>
            <line className="callout-lead" x1={edge.x} y1={edge.y} x2={pin.ax} y2={pin.ay} />
            <circle className="callout-target" cx={pin.ax} cy={pin.ay} r="1.6" />
            <rect
              className="callout-box"
              x={pin.x - CALLOUT_W / 2}
              y={pin.y - CALLOUT_H / 2}
              width={CALLOUT_W}
              height={CALLOUT_H}
              rx="3"
            />
            {Glyph ? (
              <g transform={`translate(${pin.x} ${pin.y})`}>
                <Glyph />
              </g>
            ) : null}
          </g>
        );
      })}
    </>
  );
}

/** Tranh của một cảnh. `aria-hidden`: mọi từ đã có mặt ở ghim và ở danh sách. */
export function SceneArt({ scene, active }: { scene: Scene; active: number | null }) {
  const Art = ARTS[scene.id];
  return (
    <svg className="scene-art" viewBox={`0 0 ${scene.art.w} ${scene.art.h}`} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round">
        <Art />
        <Callouts scene={scene} active={active} />
      </g>
    </svg>
  );
}
