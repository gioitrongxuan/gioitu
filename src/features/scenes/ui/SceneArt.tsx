// Tranh cho từng cảnh.
//
// Phòng ốc: tranh nét vẽ bằng SVG ngay trong code — chạy offline, phóng to bao
// nhiêu cũng nét. Màu lấy từ bảng màu minh hoạ khai ở đầu `scenes.css`: mỗi
// khối mang một class chất liệu (`art art-wood`, `art art-metal`…), class chỉ
// đặt `--c` còn CSS lo tô phẳng + viền. Nét chi tiết không có class thì vẫn là
// mực `currentColor` như cũ. Vẫn không bóng, không gradient (DESIGN §1).
//
// Hai cảnh cơ thể: dùng hình giải phẫu thật ở `domain/anatomy.ts` (trích từ bộ
// anatomogram của EBI, Apache-2.0) thay vì hình vẽ tay — đường viền cơ thể cho
// cả hai cảnh, cộng thêm từng nội tạng cho cảnh "bên trong". Ô chú giải ở lề
// phóng to đúng bộ phận đó, nên nhìn ô là đoán được từ. Hình vẫn là path SVG
// nên vẫn ăn token màu như phần vẽ tay.

import { BODY_OUTLINE, ORGANS, OrganKey } from "../domain/anatomy";
import {
  ArtBox,
  BODY_FIGURE,
  calloutEdge,
  calloutFit,
  CALLOUT_H,
  CALLOUT_W,
  hasCallout,
  pinAnchor,
  Scene,
  SceneId,
  thumbBox,
} from "../domain/scenes";

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
 * Tóc: hình gốc của anatomogram trọc đầu, mà 髪 lại là từ phải có. Đây là phần
 * SỬA ĐỔI của ta, không nằm trong file sinh tự động.
 *
 * Vẽ thành sợi chứ không phải một mảng đặc — mảng đặc đọc ra thành mũ. Khối
 * tóc chỉ tô rất nhạt để có chỗ đứng, còn cái nhìn ra là tóc là chùm sợi tỏa
 * từ đường ngôi (lệch trái, ~50.8/2.2 trong hệ ANATOMY_VIEW) vòng theo hộp sọ
 * xuống chân tóc. Chân tóc dừng trên vành tai để 耳 vẫn còn chỗ trỏ.
 */
const HAIR_MASS =
  // Đỉnh vống lên hẳn so với hộp sọ (đỉnh sọ ~y1.5) — sát quá thì hai nét viền
  // chạy song song, nhìn thành cái băng đô. Hai bên vẫn dừng ở thái dương.
  "M44.8 12.6C44.5 7 47.5 0 52.6 0C57.7 0 60.7 7 60.4 12.6L59.5 12.6" +
  "C59.1 9.4 56.8 8.5 54.4 8.7C53.4 8.8 53 9.5 52.6 9.5C52.2 9.5 51.8 8.8 50.8 8.7" +
  "C48.4 8.5 46.1 9.4 45.7 12.6Z";

/**
 * Bóng người tô da, nằm DƯỚI đường viền — cũng là phần SỬA ĐỔI của ta, không
 * nằm trong file sinh tự động.
 *
 * `BODY_OUTLINE` của anatomogram là một dải viền rỗng ruột (viền ngoài và viền
 * trong cùng nằm trong một path, ngược chiều nhau), nên tô màu vào chỉ ăn đúng
 * dải viền đó — thân người vẫn trắng, nhìn như hình chưa tô xong. Khối dưới đây
 * lấp phần ruột: vẽ thô theo trục chi, CỐ Ý thụt vào trong vài phần trăm để
 * dải viền thật phủ lên mép, không lòi màu da ra ngoài hình.
 */
const BODY_FILL = [
  // đầu (đỉnh có tóc phủ) và cổ
  "M53 0.5c4.3 0 7.8 5.8 7.8 13S57.3 26.5 53 26.5 45.2 20.7 45.2 13.5 48.7 0.5 53 0.5Z",
  "M47.8 19h10.4v16H47.8z",
  // thân: vai → ngực → eo → hông
  "M44 26 34 35 32 40l4.5 7 .8 7 2.4 8 .2 4-.6 4-.2 4-.6 4-1.2 4-.4 4-.2 4-.2 8 1 8h31l1.2-8 .2-8-.2-4-.6-4-1.2-4-.4-4-.4-4-1-4 .2-4 2.6-8 .6-7 4.5-7-2-5-10-9Z",
  // tay trái: vai → khuỷu → cổ tay, rồi vòng ngược lên theo mép trong
  "M31.5 34 29.5 46 27.9 54 26.5 58 25.9 62 24.1 66 20.9 70 19.1 74 17.5 78 15.9 82 13.1 86 9 91" +
    " 16.2 91 18.9 86 22.1 82 25.3 78 28.3 74 30.1 70 31.7 66 33.7 62 35.9 58 35.9 54 35.1 46 38 34Z",
  "M7 88 4 96 6.5 101.5 13.5 100.5 16 90Z",
  // tay phải — cùng số đo, lấy đối xứng qua trục dọc giữa hình (x = 53)
  "M74.5 34 76.5 46 78.1 54 79.5 58 80.1 62 81.9 66 85.1 70 86.9 74 88.5 78 90.1 82 92.9 86 97 91" +
    " 89.8 91 87.1 86 83.9 82 80.7 78 77.7 74 75.9 70 74.3 66 72.3 62 70.1 58 70.1 54 70.9 46 68 34Z",
  "M99 88 102 96 99.5 101.5 92.5 100.5 90 90Z",
  // hai chân, kể cả bàn chân
  "M35.6 100 36 118 38 128 38 142 37.6 152 39.6 166 42 178 41.6 188 38.6 193h9.4l-.6-15 -1-12 1.2-14" +
    " .6-10 1-14 1.2-10 .8-18Z",
  "M70.4 100 70 118 68 128 68 142 68.4 152 66.4 166 64 178 64.4 188 67.4 193H58l.6-15 1-12-1.2-14" +
    " -.6-10-1-14-1.2-10-.8-18Z",
];

/** Sợi tỏa từ đường ngôi, vòng theo hộp sọ xuống chân tóc. */
const HAIR_STRANDS = [
  "M50.6 1.4C47 1.8 44.9 6.6 45.4 12.5",
  "M50.6 1.4C47.3 2.2 45.3 6.2 45.9 10.8",
  "M50.6 1.4C47.8 2.6 46 6 46.9 9.8",
  "M50.6 1.4C48.3 3 46.9 6 47.9 9.2",
  "M50.6 1.4C48.9 3.6 48.2 6 49.3 8.7",
  "M50.6 1.4C49.7 4.2 50.1 6.2 50.9 8.6",
  "M50.6 1.4C51.9 2.2 53.4 5.6 54.3 8.8",
  "M50.6 1.4C52.7 1.8 55 5.4 55.9 9.1",
  "M50.6 1.4C53.9 1.5 56.7 5.4 57.4 9.7",
  "M50.6 1.4C55.3 1.2 58 6 58.6 11",
  "M50.6 1.4C56.9 1.1 59.1 7.2 59.4 12.5",
];

// Nét ở đây dày theo hệ toạ độ của hình giải phẫu, mà hệ đó lại bị `scale` thu
// nhỏ hơn một nửa — nên con số phải lớn hơn nét tranh phòng ốc mới ra cùng độ
// dày trên màn.
function BodyFigure({ organs, active, box }: { organs: Set<OrganKey>; active: OrganKey | null; box: ArtBox }) {
  return (
    <>
      {/* Mảng nền của bảng giải phẫu: hình người mà đứng trên nền trơn thì
          trông như bị bỏ quên giữa trang, còn ô chú giải nền trắng cần một
          mảng đằng sau để nổi lên. */}
      <rect className="art art-bg art-poster" x="0" y="0" width={box.w} height={box.h} />
      <g
        transform={`translate(${BODY_FIGURE.x} ${BODY_FIGURE.y}) scale(${BODY_FIGURE.scale})`}
        strokeWidth={0.55}
      >
        {/* Có nội tạng thì da lùi xuống thành lớp kính: cảnh "bên trong" mà tô
            da đặc là che mất đúng thứ đang muốn xem. */}
        <g className={`art art-bg art-body-fill${organs.size ? " see-through" : ""}`}>
          {BODY_FILL.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <path className={`art art-body${organs.size ? " see-through" : ""}`} d={BODY_OUTLINE} />
        <path className="art art-hair" d={HAIR_MASS} />
        <g className="art-hair-strand" strokeWidth={0.4}>
          {HAIR_STRANDS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {/* Cái đang chọn vẽ sau cùng, kẻo bị mấy khối nằm trước che mất. */}
        {ORGAN_DEPTH.filter((k) => organs.has(k) && k !== active)
          .concat(active && organs.has(active) ? [active] : [])
          .map((key) => (
            <g key={key} className={`art-organ organ-${key}${key === active ? " active" : ""}`}>
              {ORGANS[key].d.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          ))}
      </g>
    </>
  );
}

function HouseArt() {
  return (
    <>
      {/* trời và sân — nền phải có trước, mọi thứ khác vẽ đè lên */}
      <rect className="art art-bg art-sky" x="0" y="0" width="160" height="120" />
      <rect className="art art-bg art-ground" x="0" y="108" width="160" height="12" />
      <path d="M2 112h156" />
      {/* mái ngói kawara: xanh xám, kẻ vài hàng ngói dọc theo dốc mái */}
      <path className="art art-roof" d="M16 41 80 9l64 32z" />
      <path className="art-s art-roof" d="M28 35 80 9M44 29 80 12M60 23 80 15" />
      {/* khối nhà; trần dưới mái, sàn gỗ giữa hai tầng, vách chia phòng */}
      <path className="art art-wall" d="M24 41h112v71H24z" />
      <path className="art art-wall-2" d="M24 41h112v4H24z" />
      <path className="art art-wall-2" d="M24 41h4v71h-4z" />
      <path className="art art-wood" d="M24 73h112v4H24z" />
      <path d="M76 41v32M108 41v32M52 77v35M96 77v35" />
      {/* tầng trên: giường có chăn + gối (寝室), bồn tắm, chỗ rửa mặt, bồn cầu */}
      <path className="art art-fabric" d="M30 62h22v10H30z" />
      <path className="art art-paper" d="M30 62h6v10h-6z" />
      <path className="art art-water" d="M80 60h20v10H80z" />
      <path className="art art-porcelain" d="M94 66h10v4H94z" />
      <path className="art art-porcelain" d="M116 56h10v8h-10z" />
      <path className="art art-porcelain" d="M118 64h6v6h-6z" />
      {/* tầng dưới: cửa vào, cửa sổ chia ô kiểu shoji, sofa, bệ bếp, cầu thang */}
      <path className="art art-wood-2" d="M28 88h16v24H28z" />
      <circle className="art art-metal" cx="41" cy="100" r="1.2" />
      <path className="art art-glass" d="M56 80h14v10H56z" />
      <path d="M63 80v10M56 85h14" />
      {/* chiếu tatami của phòng khách, kẻ mạch giữa hai chiếc */}
      <path className="art art-tatami" d="M54 106h40v6H54z" />
      <path d="M74 106v6" />
      <path className="art art-fabric-2" d="M58 98h20v8H58z" />
      <path className="art art-fabric-2" d="M58 93h20v5H58z" />
      <path className="art art-metal" d="M100 84h24v6h-24z" />
      <path className="art art-wood" d="M100 90h24v22h-24z" />
      <path d="M112 90v22" />
      {/* cầu thang: từng bậc gỗ leo lên tầng trên */}
      <path className="art art-wood" d="M84 106h4v6h-4zM88 100h4v12h-4zM92 94h4v18h-4zM96 88h4v24h-4z" />
      {/* cây trong sân */}
      <path className="art-s art-wood-2" d="M150 112v-8" />
      <circle className="art art-leaf" cx="150" cy="99" r="6" />
    </>
  );
}

function KitchenArt() {
  return (
    <>
      {/* tường, mảng gạch men sau bệ bếp, sàn gỗ */}
      <rect className="art art-bg art-wall" x="0" y="0" width="160" height="120" />
      <rect className="art art-bg art-tile" x="0" y="48" width="160" height="14" />
      <path className="art-s art-tile" d="M16 48v14M32 48v14M48 48v14M64 48v14M80 48v14M96 48v14M112 48v14" />
      <rect className="art art-bg art-floor" x="0" y="106" width="160" height="14" />
      <path d="M2 106h156" />
      {/* tủ bát đĩa treo tường: đĩa dựng, bát, đũa */}
      <path className="art art-wood" d="M14 20h40v30H14z" />
      <path d="M14 36h40" />
      <circle className="art art-porcelain" cx="24" cy="29" r="5" />
      <circle className="art art-porcelain" cx="35" cy="29" r="5" />
      <circle className="art art-porcelain" cx="46" cy="29" r="5" />
      <path className="art art-porcelain" d="M18 40q4 7 9 0z M30 40q4 7 9 0z" />
      <path className="art-s art-wood-2" d="M45 48l3-8M48 48l3-8" />
      {/* lò vi sóng và chảo treo */}
      <path className="art art-metal" d="M60 24h32v22H60z" />
      <path className="art art-glass" d="M64 28h20v14H64z" />
      <circle className="art art-fire" cx="88" cy="31" r="1.2" />
      <circle className="art art-metal" cx="104" cy="32" r="8" />
      <path className="art-s art-wood-2" d="M110 27l8-6" />
      {/* bệ bếp: mặt bệ thép, thân tủ gỗ, cánh */}
      <path className="art art-metal" d="M14 62h108v6H14z" />
      <path className="art art-wood" d="M16 68h104v36H16z" />
      <path d="M68 68v36" />
      <path d="M16 80h104" />
      <path className="art-s art-metal" d="M34 74h16M86 74h16" />
      {/* bồn rửa và vòi */}
      <ellipse className="art art-metal" cx="34" cy="65" rx="13" ry="3" />
      <circle className="art art-water" cx="34" cy="65" r="1.2" />
      <path className="art-s art-metal" d="M22 62V52q0-4 4-4h8v4" />
      {/* thớt và dao */}
      <path className="art art-wood" d="M52 57h20v5H52z" />
      <path className="art art-metal" d="M56 55h14v-2l-14 1z" />
      <path className="art-s art-wood-2" d="M70 54h4" />
      {/* bếp hai lò đang cháy + núm điều khiển, nồi trên lò */}
      <circle className="art art-fire" cx="80" cy="64" r="5" />
      <circle className="art art-fire" cx="94" cy="64" r="5" />
      <circle className="art art-metal" cx="82" cy="74" r="1.4" />
      <circle className="art art-metal" cx="92" cy="74" r="1.4" />
      <path className="art art-metal" d="M72 50h16l-2 12H74z" />
      <path d="M72 50h16M78 47h4" />
      {/* nồi cơm điện, đèn báo đang nấu */}
      <path className="art art-porcelain" d="M102 48h18v14h-18z" />
      <path d="M102 53h18" />
      <circle className="art art-vermilion" cx="117" cy="58" r="1.2" />
      {/* tủ lạnh: hai khoang, tay nắm */}
      <path className="art art-porcelain" d="M128 34h30v70h-30z" />
      <path d="M128 58h30" />
      <path className="art-s art-metal" d="M152 44v10M152 64v12" />
    </>
  );
}

function OfficeArt() {
  return (
    <>
      {/* tường và thảm sàn */}
      <rect className="art art-bg art-wall" x="0" y="0" width="160" height="120" />
      <rect className="art art-bg art-wall-2" x="0" y="110" width="160" height="10" />
      <path d="M2 110h156" />
      {/* đồng hồ tường */}
      <circle className="art art-porcelain" cx="20" cy="20" r="7" />
      <path d="M20 20v-4M20 20l3 2" />
      {/* vách kính chia phòng họp, chừa lối cửa */}
      <path className="art art-glass" d="M114 8h3v62h-3zM114 90h3v20h-3z" />
      {/* quầy tiếp tân + người tiếp tân + kệ danh thiếp */}
      <path className="art art-wood" d="M6 58h34v8H6z" />
      <path className="art art-wood-2" d="M8 66h30v38H8z" />
      <path className="art art-paper" d="M32 54h6v4h-6z" />
      <path className="art art-glass" d="M12 48h12v10H12z" />
      <circle className="art art-skin" cx="28" cy="55" r="2.5" />
      {/* đồng nghiệp đứng cạnh bàn */}
      <circle className="art art-skin" cx="44" cy="51" r="5" />
      <path className="art art-shirt" d="M38 62q2-6 6-6t6 6l-1 14h-10z" />
      {/* bàn làm việc + chân bàn */}
      <path className="art art-wood" d="M52 62h48v6H52z" />
      <path d="M58 68v36M94 68v36" />
      {/* máy tính, giấy tờ, điện thoại, con dấu trên bàn */}
      <path className="art art-glass" d="M58 44h20v16H58z" />
      <path d="M62 62h12M68 60v2" />
      <path className="art art-paper" d="M84 48h14v7H84z" />
      <path d="M86 46h14v7M88 44h14v7" />
      <path className="art art-metal" d="M84 56h12v6H84z" />
      <path d="M86 56q3-3 6 0" />
      <path className="art art-vermilion" d="M100 54h4v8h-4z" />
      {/* ghế xoay trước bàn */}
      <path className="art art-fabric" d="M62 76h24v5H62z" />
      <path className="art art-fabric" d="M80 62h5v14h-5z" />
      <path className="art-s art-metal" d="M74 81v11M65 94h18" />
      <circle className="art art-metal" cx="66" cy="96" r="2" />
      <circle className="art art-metal" cx="82" cy="96" r="2" />
      {/* máy in */}
      <path className="art art-metal" d="M98 82h14v22H98z" />
      <path className="art art-paper" d="M98 86h14v4H98z" />
      <path d="M100 96h10" />
      {/* phòng họp: bảng trắng có nét viết, bàn họp, ghế, trưởng phòng */}
      <path className="art art-porcelain" d="M122 14h32v24h-32z" />
      <path className="art-s art-metal" d="M124 40h28" />
      <path className="art-s art-fabric" d="M126 20h16" />
      <path className="art-s art-vermilion" d="M126 26h20" />
      <ellipse className="art art-wood" cx="138" cy="60" rx="18" ry="7" />
      <path className="art art-fabric" d="M144 46h8v5h-8zM136 72h8v5h-8z" />
      <circle className="art art-skin" cx="130" cy="46" r="4" />
      <path className="art art-shirt" d="M125 56q1-6 5-6t5 6z" />
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
          <g
            key={pin.term}
            className={`callout${pin.organ ? ` organ-${pin.organ}` : ""}${i === active ? " active" : ""}`}
          >
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

/** Nội tạng cần vẽ cho một cảnh — cảnh phòng ốc trả về tập rỗng. */
function sceneOrgans(scene: Scene): Set<OrganKey> {
  return new Set(scene.pins.map((p) => p.organ).filter((k): k is OrganKey => k != null));
}

/** Tranh của một cảnh. `aria-hidden`: mọi từ đã có mặt ở ghim và ở danh sách. */
export function SceneArt({ scene, active }: { scene: Scene; active: number | null }) {
  const Room = ROOM_ARTS[scene.id];
  const activeOrgan = active == null ? null : (scene.pins[active]?.organ ?? null);
  return (
    <svg className="scene-art" viewBox={`0 0 ${scene.art.w} ${scene.art.h}`} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round">
        {Room ? <Room /> : <BodyFigure organs={sceneOrgans(scene)} active={activeOrgan} box={scene.art} />}
        <Callouts scene={scene} active={active} />
      </g>
    </svg>
  );
}

/**
 * Ảnh thu nhỏ của cảnh, dùng cho danh sách chọn cảnh: cùng tranh nhưng bỏ hết
 * ghim và ô chú giải — ở cỡ này chúng chỉ còn là nhiễu. Khung nhìn cắt theo
 * `thumbBox` nên hình chiếm trọn ô.
 */
export function SceneThumb({ scene }: { scene: Scene }) {
  const Room = ROOM_ARTS[scene.id];
  const box = thumbBox(scene);
  return (
    <svg
      className="scene-art scene-thumb"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round">
        {Room ? <Room /> : <BodyFigure organs={sceneOrgans(scene)} active={null} box={scene.art} />}
      </g>
    </svg>
  );
}
