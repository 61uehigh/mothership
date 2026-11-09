/**
 * ### KOREAN_HOLIDAYS
 *
 * Public holidays in Korea (공휴일), substitute holidays (대체공휴일) and the
 * days around 설날 and 추석 included; memorial days that are not days off
 * (기념일) left out. Copied from Google Calendar's "대한민국의 휴일" calendar
 * (`ko.south_korea#holiday@group.v.calendar.google.com`) for 2026–2027, the
 * years of the Daily Scrum posts. Add a year here before importing posts
 * from it; company days off are not known.
 */
export const KOREAN_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // 새해첫날
  "2026-02-16", // 설날 연휴
  "2026-02-17", // 설날
  "2026-02-18", // 설날 연휴
  "2026-03-01", // 삼일절 (일)
  "2026-03-02", // 대체공휴일 삼일절
  "2026-05-01", // 노동절
  "2026-05-05", // 어린이날
  "2026-05-24", // 부처님오신날 (일)
  "2026-05-25", // 대체공휴일 부처님오신날
  "2026-06-03", // 지방선거일
  "2026-06-06", // 현충일 (토)
  "2026-07-17", // 제헌절
  "2026-08-15", // 광복절 (토)
  "2026-08-17", // 대체공휴일 광복절
  "2026-09-24", // 추석 연휴
  "2026-09-25", // 추석
  "2026-09-26", // 추석 연휴 (토)
  "2026-10-03", // 개천절 (토)
  "2026-10-05", // 대체공휴일 개천절
  "2026-10-09", // 한글날
  "2026-12-25", // 크리스마스
  // 2027
  "2027-01-01", // 새해첫날
  "2027-02-07", // 설날 (일)
  "2027-02-08", // 설날 연휴
  "2027-02-09", // 대체공휴일 설날
  "2027-03-01", // 삼일절
  "2027-05-01", // 노동절 (토)
  "2027-05-03", // 대체공휴일 노동절
  "2027-05-05", // 어린이날
  "2027-05-13", // 부처님오신날
  "2027-06-06", // 현충일 (일)
  "2027-07-17", // 제헌절 (토)
  "2027-07-19", // 대체공휴일 제헌절
  "2027-08-15", // 광복절 (일)
  "2027-08-16", // 대체공휴일 광복절
  "2027-09-14", // 추석 연휴
  "2027-09-15", // 추석
  "2027-09-16", // 추석 연휴
  "2027-10-03", // 개천절 (일)
  "2027-10-04", // 대체공휴일 개천절
  "2027-10-09", // 한글날 (토)
  "2027-10-11", // 대체공휴일 한글날
  "2027-12-25", // 크리스마스 (토)
  "2027-12-27", // 대체공휴일 크리스마스
]);

/**
 * ### HOLIDAY_YEARS
 *
 * The years {@link KOREAN_HOLIDAYS} covers; posts outside them are dated
 * with weekends only, and the import says so.
 */
export const HOLIDAY_YEARS: ReadonlySet<string> = new Set(["2026", "2027"]);
