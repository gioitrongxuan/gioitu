// Tranh cho từng cảnh.
//
// Phòng ốc: tranh nét vẽ bằng SVG ngay trong code — chạy offline, đổi theme là
// đổi màu theo token (DESIGN.md §1: nét mực `currentColor`, khối tô bằng
// color-mix, không bóng, không gradient), phóng to bao nhiêu cũng nét.
//
// Hai cảnh cơ thể: dùng hình giải phẫu thật ở `domain/anatomy.ts` (trích từ bộ
// anatomogram của EBI, Apache-2.0) thay vì hình vẽ tay — đường viền cơ thể cho
// cả hai cảnh, cộng thêm từng nội tạng cho cảnh "bên trong". Ô chú giải ở lề
// phóng to đúng bộ phận đó, nên nhìn ô là đoán được từ. Hình vẫn là path SVG
// nên vẫn ăn token màu như phần vẽ tay.

import { BODY_OUTLINE, ORGANS, OrganKey } from "../domain/anatomy";
import { BODY_FIGURE, calloutEdge, calloutFit, CALLOUT_H, CALLOUT_W, hasCallout, pinAnchor, Scene, SceneId } from "../domain/scenes";

/**
 * Hình người: đường viền, và với cảnh "bên trong" là các nội tạng có trong
 * danh sách từ của cảnh. Thứ tự vẽ đi từ khối lớn nằm sau ra khối nhỏ nằm
 * trước, để cái nào cũng còn thấy được viền.
 */
const ORGAN_DEPTH: OrganKey[] = [
  "diaphragm",
  "lung",
  "liver",
  "colon",
  "smallIntestine",
  "kidney",
  "stomach",
  "spleen",
  "pancreas",
  "esophagus",
  "aorta",
  "heart",
  "bladder",
  "throat",
  "brain",
  "tongue",
  "bone",
  "muscle",
];

/**
 * Tóc: hình gốc của anatomogram trọc đầu, mà 髪 lại là từ phải có. Vẽ thêm một
 * mảng tóc ôm đúng hộp sọ — cung ngoài bám vòng đầu (tâm ~52.6,12.5 trong hệ
 * ANATOMY_VIEW), đường chân tóc lượn xuống hai bên thái dương. Đây là phần
 * SỬA ĐỔI của ta, không nằm trong file sinh tự động.
 */
const HAIR =
  "M44.8 12.6A7.9 12 0 0 1 60.4 12.6L59.5 12.6" +
  "C59.1 9.4 56.8 8.5 54.4 8.7C53.4 8.8 53 9.5 52.6 9.5C52.2 9.5 51.8 8.8 50.8 8.7" +
  "C48.4 8.5 46.1 9.4 45.7 12.6Z";

function BodyFigure({ organs, active }: { organs: Set<OrganKey>; active: OrganKey | null }) {
  return (
    <g
      transform={`translate(${BODY_FIGURE.x} ${BODY_FIGURE.y}) scale(${BODY_FIGURE.scale})`}
      strokeWidth={0.3}
    >
      <path className="art-body" d={BODY_OUTLINE} />
      <path className="art-hair" d={HAIR} />
      {/* Cái đang chọn vẽ sau cùng, kẻo bị mấy khối nằm trước che mất. */}
      {ORGAN_DEPTH.filter((k) => organs.has(k) && k !== active)
        .concat(active && organs.has(active) ? [active] : [])
        .map((key) => (
          <g key={key} className={`art-organ${key === active ? " active" : ""}`}>
            {ORGANS[key].d.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        ))}
    </g>
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

/** Tranh nét của các cảnh phòng ốc; hai cảnh cơ thể đi đường `BodyFigure`. */
const ROOM_ARTS: Partial<Record<SceneId, () => JSX.Element>> = {
  house: HouseArt,
  kitchen: KitchenArt,
  office: OfficeArt,
};

/**
 * Lớp chú giải kiểu hình giải phẫu: ô ở lề chứa chính bộ phận đó phóng to, nối
 * vào hình bằng một đường dẫn. Ghim có neo mà không có bộ phận (cảnh "bên
 * ngoài") thì chỉ có đường dẫn, vì bộ phận ấy không tách ra thành hình riêng.
 */
function Callouts({ scene, active }: { scene: Scene; active: number | null }) {
  return (
    <>
      {scene.pins.map((pin, i) => {
        const anchor = pinAnchor(pin);
        if (!anchor) return null;
        const boxed = hasCallout(pin);
        const edge = boxed ? calloutEdge(scene, pin) : pin;
        const fit = calloutFit(pin);
        return (
          <g key={pin.term} className={`callout${i === active ? " active" : ""}`}>
            <line className="callout-lead" x1={edge.x} y1={edge.y} x2={anchor.x} y2={anchor.y} />
            <circle className="callout-target" cx={anchor.x} cy={anchor.y} r="1.8" />
            {boxed && fit ? (
              <>
                <rect
                  className="callout-box"
                  x={pin.x - CALLOUT_W / 2}
                  y={pin.y - CALLOUT_H / 2}
                  width={CALLOUT_W}
                  height={CALLOUT_H}
                  rx="3"
                />
                <g
                  className="callout-shape"
                  transform={`translate(${fit.x} ${fit.y}) scale(${fit.scale})`}
                  strokeWidth={0.5 / fit.scale}
                >
                  {ORGANS[pin.organ!].d.map((d, k) => (
                    <path key={k} d={d} />
                  ))}
                </g>
              </>
            ) : null}
          </g>
        );
      })}
    </>
  );
}

/** Tranh của một cảnh. `aria-hidden`: mọi từ đã có mặt ở ghim và ở danh sách. */
export function SceneArt({ scene, active }: { scene: Scene; active: number | null }) {
  const Room = ROOM_ARTS[scene.id];
  const organs = new Set(scene.pins.map((p) => p.organ).filter((k): k is OrganKey => k != null));
  const activeOrgan = active == null ? null : (scene.pins[active]?.organ ?? null);
  return (
    <svg className="scene-art" viewBox={`0 0 ${scene.art.w} ${scene.art.h}`} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round">
        {Room ? <Room /> : <BodyFigure organs={organs} active={activeOrgan} />}
        <Callouts scene={scene} active={active} />
      </g>
    </svg>
  );
}
