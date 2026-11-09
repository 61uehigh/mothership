import { describe, expect, it } from "vitest";
import { KOREAN_HOLIDAYS } from "@/features/todos/model/koreanHolidays";
import { isThreadReply, parseScrumPost, sameWork, scrumDoneItems, workdayBefore, type ScrumPost } from "@/features/todos/model/ScrumImport";

const NONE = new Set<string>();
// 10:00 in Seoul on `day`.
const at = (day: string) => Date.parse(`${day}T10:00:00+09:00`);
const post = (day: string, markup: string, id = day.replaceAll("-", "")): ScrumPost => ({
  ts: `${at(day) / 1000}.000100`,
  at: at(day),
  permalink: `https://x.slack.com/archives/C1/p${id}`,
  markup,
});
const report = (done: Array<string>, plan: Array<string>) => ["어제 한 일", ...done.map((d) => `• ${d}`), "오늘 할 일", ...plan.map((p) => `• ${p}`)].join("\n");

describe("parseScrumPost", () => {
  it("turns leaf bullets into items, keeping the bullets above them and links", () => {
    const parsed = parseScrumPost(
      [
        "어제 한일",
        "• Heimdal Export 수정 &amp; 정리",
        "• Safety",
        "    ◦ 미해결 이슈",
        "        ▪︎ DEV-1607 빈 결과를 204로",
        "        ▪︎ PR 리뷰 - <https://github.com/o/r/pull/132|fix(build): token #132>",
        "    ◦ 박람회 준비",
        "",
        "오늘 할일",
        "• kit 개발",
      ].join("\n"),
    );
    expect(parsed?.daysBack).toBe(1);
    expect(parsed?.done.map((b) => [b.path.join(" › "), b.text])).toEqual([
      ["", "Heimdal Export 수정 & 정리"],
      ["Safety › 미해결 이슈", "DEV-1607 빈 결과를 204로"],
      ["Safety › 미해결 이슈", "PR 리뷰 - fix(build): token #132"],
      ["Safety", "박람회 준비"],
    ]);
    expect(parsed?.done[2]?.markdown).toBe("PR 리뷰 - [fix(build): token #132](https://github.com/o/r/pull/132)");
    expect(parsed?.plan.map((b) => b.text)).toEqual(["kit 개발"]);
  });

  it("reads 그저께 as two days back and numbered lists", () => {
    const parsed = parseScrumPost("그저께 한 일\n1. 첫째\n2) 둘째\n오늘 할 일\n- 셋째");
    expect(parsed?.daysBack).toBe(2);
    expect(parsed?.done.map((b) => b.text)).toEqual(["첫째", "둘째"]);
    expect(parsed?.plan.map((b) => b.text)).toEqual(["셋째"]);
  });

  it("ignores a message without a done section", () => {
    expect(parseScrumPost("어제 세팅하시던 게 잘 안 됐어요")).toBeUndefined();
  });
});

describe("workdayBefore", () => {
  it("takes Monday back to Friday and skips holidays", () => {
    expect(workdayBefore("2026-10-19", 1, NONE)).toBe("2026-10-16");
    // Tuesday 6 Oct 2026, the day after the substitute holiday for 개천절: Friday 2 Oct.
    expect(workdayBefore("2026-10-06", 1, new Set(["2026-10-05"]))).toBe("2026-10-02");
    expect(workdayBefore("2026-11-20", 2, NONE)).toBe("2026-11-18");
  });
});

describe("workdayBefore with Korean holidays", () => {
  const before = (day: string) => workdayBefore(day, 1, KOREAN_HOLIDAYS);

  it("skips a single holiday", () => {
    // Thursday after 지방선거일 (Wed 3 Jun 2026) reports Tuesday.
    expect(before("2026-06-04")).toBe("2026-06-02");
    // Monday after 한글날 (Fri 9 Oct 2026) reports Thursday.
    expect(before("2026-10-12")).toBe("2026-10-08");
  });

  it("skips a multi-day holiday that runs into the weekend", () => {
    // 추석 2026 is Thu 24 – Sat 26 Sep: Monday 28 Sep reports Wednesday 23.
    expect(before("2026-09-28")).toBe("2026-09-23");
  });

  it("skips a substitute holiday", () => {
    // 개천절 falls on Saturday 3 Oct 2026, so Monday 5 Oct is off: Tuesday reports Friday 2 Oct.
    expect(before("2026-10-06")).toBe("2026-10-02");
    // 설날 2027 runs Sun 7 – Tue 9 Feb with a substitute day: Wednesday reports Friday 5 Feb.
    expect(before("2027-02-10")).toBe("2027-02-05");
  });
});

describe("KOREAN_HOLIDAYS", () => {
  it("lists real dates only", () => {
    for (const day of KOREAN_HOLIDAYS) expect(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10)).toBe(day);
  });
});

describe("isThreadReply", () => {
  it("tells a reply from a post that has replies", () => {
    expect(isThreadReply({ ts: "2.0", permalink: "https://x/p2?thread_ts=1.0&cid=C1" })).toBe(true);
    expect(isThreadReply({ ts: "1.0", permalink: "https://x/p1?thread_ts=1.0&cid=C1" })).toBe(false);
    expect(isThreadReply({ ts: "1.0", permalink: "https://x/p1" })).toBe(false);
  });
});

describe("sameWork", () => {
  it("matches by issue id or by most words of the shorter bullet", () => {
    expect(sameWork("DEV-2063 GDPR 수정", "DEV-2063 Safety International GDPR 대비 수정 (항목6)")).toBe(true);
    expect(sameWork("(시간 되면) 10세트 세팅/발송 to 멀티온", "영유아케어 10세트 세팅/전달 to 멀티온")).toBe(true);
    expect(sameWork("v2026.02.2 작업 분배 및 일정 수립", "Safety v2026.02.2 개발")).toBe(false);
  });
});

describe("scrumDoneItems", () => {
  it("dates each report to the workday before its post, Monday's to Friday", () => {
    const { items, posts } = scrumDoneItems(
      [post("2026-10-15", report(["수요일 일"], ["목요일 계획"])), post("2026-10-19", report(["금요일 일"], [])), post("2026-10-16", report(["목요일 일"], ["금요일 계획"]))],
      NONE,
      "2026-11-23",
    );
    expect(posts).toBe(3);
    expect(items.map((i) => [i.day, i.title, i.inferred])).toEqual([
      ["2026-10-14", "수요일 일", false],
      ["2026-10-15", "목요일 일", false],
      ["2026-10-16", "금요일 일", false],
    ]);
    expect(new Date(items[0]!.doneAt).toISOString()).toBe("2026-10-14T09:00:00.000Z");
  });

  it("infers Friday from its plan when Monday has no post, leaving out what Tuesday mentions", () => {
    const { items, notes } = scrumDoneItems(
      [post("2026-10-23", report(["목요일 일"], ["작업 분배 및 일정 수립", "kit 설계/개발"])), post("2026-10-27", report(["kit 개발"], ["Safety 개발"]))],
      NONE,
      "2026-11-23",
    );
    expect(items.map((i) => [i.day, i.title, i.inferred])).toEqual([
      ["2026-10-22", "목요일 일", false],
      ["2026-10-23", "작업 분배 및 일정 수립", true],
      ["2026-10-26", "kit 개발", false],
    ]);
    expect(items[1]?.body).toContain("Inferred");
    expect(items[1]?.key).toBe("https://x.slack.com/archives/C1/p20261023#plan-0");
    expect(notes.map((n) => n.day)).toContain("2026-10-23");
  });

  it("does not infer a mid-week day nobody reported", () => {
    const { items, notes } = scrumDoneItems([post("2026-10-19", report(["금요일 일"], ["10세트 세팅해서 보내기"])), post("2026-10-22", report(["수요일 일"], []))], NONE, "2026-11-23");
    expect(items.map((i) => [i.day, i.inferred])).toEqual([
      ["2026-10-16", false],
      ["2026-10-21", false],
    ]);
    expect(notes.find((n) => n.day === "2026-10-19")?.note).toContain("not inferred");
  });

  it("infers the last workday before a holiday from the first post after it", () => {
    // Wed 23 Sep 2026 is the day before 추석; the next post is Monday 28 Sep.
    const { items } = scrumDoneItems(
      [post("2026-09-23", report(["화요일 일"], ["릴리즈 노트 작성"])), post("2026-09-29", report(["월요일 일"], []))],
      KOREAN_HOLIDAYS,
      "2026-11-23",
    );
    expect(items.map((i) => [i.day, i.title, i.inferred])).toEqual([
      ["2026-09-22", "화요일 일", false],
      ["2026-09-23", "릴리즈 노트 작성", true],
      ["2026-09-28", "월요일 일", false],
    ]);
  });

  it("notes more than one workday without a post", () => {
    const { notes } = scrumDoneItems([post("2026-10-14", report(["a"], [])), post("2026-10-19", report(["b"], []))], NONE, "2026-11-23");
    expect(notes).toContainEqual({ day: "2026-10-15", note: "2 workdays without a post (2026-10-15, 2026-10-16): days off, or posts skipped?" });
  });

  it("leaves the latest unreported day for later and lists days with nothing to go on", () => {
    const { items, notes } = scrumDoneItems(
      [post("2026-11-17", report(["월요일 일"], [])), post("2026-11-20", report(["화요일 일"], ["금요일 계획"]))],
      NONE,
      "2026-11-23",
    );
    expect(items.map((i) => i.day)).toEqual(["2026-11-16", "2026-11-19"]);
    expect(notes).toEqual([
      { day: "2026-11-17", note: "No post reported 2026-11-17, and that day's post planned nothing to go on." },
      { day: "2026-11-18", note: "Nothing to go on: no post that day and none reporting it." },
      { day: "2026-11-18", note: "2 workdays without a post (2026-11-18, 2026-11-19): days off, or posts skipped?" },
      { day: "2026-11-20", note: "Not reported yet: no post after 2026-11-20." },
    ]);
  });

  it("skips thread replies and keys items on the permalink without its query", () => {
    const reply = { ...post("2026-10-14", report(["답글"], [])), permalink: "https://x.slack.com/archives/C1/p9?thread_ts=1.0&cid=C1" };
    const top = { ...post("2026-10-14", report(["본문"], [])), permalink: "https://x.slack.com/archives/C1/p8?thread_ts=X&cid=C1" };
    top.permalink = top.permalink.replace("X", top.ts);
    const { items } = scrumDoneItems([reply, top], NONE, "2026-11-23");
    expect(items.map((i) => [i.title, i.key])).toEqual([["본문", "https://x.slack.com/archives/C1/p8#0"]]);
  });
});
