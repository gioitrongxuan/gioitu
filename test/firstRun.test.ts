import { describe, it, expect } from "vitest";
import { decideOnboarding, wantsDictSetup, DICT_SETUP_STEP } from "@/app/firstRun";

describe("decideOnboarding (#152)", () => {
  it("người mới thật sự (chưa xem, không dữ liệu, không từ điển) → show", () => {
    expect(decideOnboarding(false, false, false)).toBe("show");
  });

  it("đã xem → none, bất kể trên máy có gì", () => {
    expect(decideOnboarding(true, false, false)).toBe("none");
    expect(decideOnboarding(true, true, true)).toBe("none");
  });

  it("chưa xem nhưng đã có dữ liệu học hoặc từ điển local → adopt (người dùng cũ, không làm phiền)", () => {
    expect(decideOnboarding(false, true, false)).toBe("adopt");
    expect(decideOnboarding(false, false, true)).toBe("adopt");
    expect(decideOnboarding(false, true, true)).toBe("adopt");
  });
});

describe("wantsDictSetup (#251)", () => {
  it("?dicts=1 → mở màn cài từ điển", () => {
    expect(wantsDictSetup(new URLSearchParams("dicts=1"))).toBe(true);
    expect(wantsDictSetup(new URLSearchParams("foo=bar&dicts=1"))).toBe(true);
  });

  it("vắng param, hoặc giá trị khác 1 → không mở (đừng cướp màn hình vì một link lạ)", () => {
    expect(wantsDictSetup(new URLSearchParams(""))).toBe(false);
    expect(wantsDictSetup(new URLSearchParams("dicts=0"))).toBe(false);
    expect(wantsDictSetup(new URLSearchParams("dicts"))).toBe(false);
    expect(wantsDictSetup(new URLSearchParams("dicts=true"))).toBe(false);
  });

  it("bước từ điển là bước 2 trong 3 của màn chào", () => {
    expect(DICT_SETUP_STEP).toBe(1);
  });
});
