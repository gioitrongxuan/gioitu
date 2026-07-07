// Built-in kanji groupings, ported verbatim (attribution and all) from
// Kuuuube's Kanji Grid data files. Adding a grouping is just dropping another
// version-1 JSON file beside these and listing it here — the loader is generic.

import jlpt from "./groupings/jlpt.json";
import grade from "./groupings/grade.json";
import rtk from "./groupings/rtk.json";
import wanikani from "./groupings/wanikani.json";
import { KanjiGrouping } from "../domain/kanjigrid";

/** Ordered as shown in the "Nhóm theo" selector; JLPT leads as the default. */
export const KANJI_GROUPINGS: KanjiGrouping[] = [jlpt, grade, rtk, wanikani] as KanjiGrouping[];
