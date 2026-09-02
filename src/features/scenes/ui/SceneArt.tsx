// Tranh nét cho từng cảnh — vẽ bằng SVG ngay trong code (không tải ảnh): chạy
// offline, đổi theme là đổi màu theo token, và phóng to bao nhiêu cũng nét.
//
// Lối vẽ theo DESIGN.md §1 (washi/sumi): nét mực `currentColor`, khối tô bằng
// color-mix rất nhạt (class ở scenes.css), không đổ bóng, không gradient. Mọi
// hình dùng chung khung ART_W × ART_H của domain/scenes.ts để ghim đặt đúng chỗ.

import { ART_H, ART_W, SceneId } from "../domain/scenes";

/**
 * Bóng người nhìn chính diện — cảnh "bên ngoài" vẽ đậm, cảnh "bên trong" vẽ mờ
 * làm khung cho nội tạng, nên tách ra dùng lại.
 */
function BodySilhouette({ faint }: { faint?: boolean }) {
  return (
    <g className={faint ? "art-faint" : undefined}>
      {/* tóc: một vòm phủ đỉnh đầu */}
      <path className="art-fill-ink" d="M68 22a12 12 0 0 1 24 0c-4-4-8-5-12-5s-8 1-12 5z" />
      <circle className="art-fill-soft" cx="80" cy="24" r="12" />
      <ellipse className="art-fill-soft" cx="67.5" cy="25" rx="2" ry="3" />
      <ellipse className="art-fill-soft" cx="92.5" cy="25" rx="2" ry="3" />
      <path className="art-fill-soft" d="M75.5 34h9v7h-9z" />
      {/* thân: vai đổ xuống, thuôn ở hông */}
      <path className="art-fill-soft" d="M61 44q19-6 38 0l-2 17-3 25H66l-3-25z" />
      {/* hai tay: dải thuôn dần, không phải que */}
      <path className="art-fill-soft" d="M62 44 48 66l-3 22h6l3-21 12-19z" />
      <path className="art-fill-soft" d="M98 44l14 22 3 22h-6l-3-21-12-19z" />
      <ellipse className="art-fill-soft" cx="45.5" cy="94" rx="4" ry="6" />
      <ellipse className="art-fill-soft" cx="114.5" cy="94" rx="4" ry="6" />
      {/* hai chân và bàn chân */}
      <path className="art-fill-soft" d="M67 86h11l-2 26h-8z" />
      <path className="art-fill-soft" d="M82 86h11l-1 26h-8z" />
      <ellipse className="art-fill-soft" cx="72" cy="114" rx="6" ry="3" />
      <ellipse className="art-fill-soft" cx="88" cy="114" rx="6" ry="3" />
    </g>
  );
}

function BodyArt() {
  return (
    <>
      <BodySilhouette />
      {/* nét mặt: mắt, mũi, miệng — đủ để ghim 目/鼻/口 có chỗ trỏ tới */}
      <circle className="art-fill-ink" cx="75" cy="22" r="1.2" />
      <circle className="art-fill-ink" cx="85" cy="22" r="1.2" />
      <path d="M80 23v4" />
      <path d="M76.5 30q3.5 2.5 7 0" />
      {/* đường vai gợi khớp, đường hông gợi thắt lưng */}
      <path className="art-faint" d="M64 47q6-3 8 1" />
      <path className="art-faint" d="M96 47q-6-3-8 1" />
      <path className="art-faint" d="M67 80h26" />
      <path className="art-faint" d="M69 97h8M83 97h8" />
    </>
  );
}

function OrgansArt() {
  return (
    <>
      <BodySilhouette faint />
      {/* não */}
      <ellipse className="art-fill-accent" cx="80" cy="19" rx="8.5" ry="6.5" />
      <path d="M74 18q3-4 6 0t6 0M74 22q3-4 6 0t6 0" />
      {/* miệng - lưỡi */}
      <path className="art-fill-seal" d="M85 30q4 1 4 3h-5z" />
      {/* khí quản xuống hai phổi */}
      <path d="M80 34v14" />
      <ellipse className="art-fill-accent" cx="70" cy="55" rx="7" ry="11" />
      <ellipse className="art-fill-accent" cx="90" cy="55" rx="7" ry="11" />
      <path d="M80 48q-6 2-8 6M80 48q6 2 8 6" />
      {/* tim nằm hơi lệch, giữa hai phổi */}
      <path className="art-fill-seal" d="M80 47q5-4 8 1t-8 10q-8-5-8-10t8-1z" />
      {/* gan, dạ dày, hai thận, ruột */}
      <path className="art-fill-accent" d="M84 59h12l-1 8h-11z" />
      <path className="art-fill-accent" d="M70 61q8-3 8 4t-6 6-6-4z" />
      <ellipse className="art-fill-accent" cx="70" cy="72" rx="3" ry="4.5" />
      <ellipse className="art-fill-accent" cx="90" cy="72" rx="3" ry="4.5" />
      <rect className="art-fill-accent" x="70" y="74" width="20" height="10" rx="3" />
      <path d="M72 77q4-3 8 0t8 0M72 81q4-3 8 0t8 0" />
      {/* xương tay, bắp tay, mạch máu, dây thần kinh chân */}
      <path className="art-faint" d="M99 46l12 21 3 20" />
      <path d="M53 55q6 4 4 10" />
      <path className="art-faint" d="M87 88l1 24" />
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

/** Tranh của một cảnh. `aria-hidden`: mọi từ đã có mặt ở ghim và ở danh sách. */
export function SceneArt({ scene }: { scene: SceneId }) {
  const Art = ARTS[scene];
  return (
    <svg className="scene-art" viewBox={`0 0 ${ART_W} ${ART_H}`} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round">
        <Art />
      </g>
    </svg>
  );
}
