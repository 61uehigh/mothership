import { describe, expect, it } from "vitest";
import { isChatTime, parseChatRow, parseDockBadge, pickChatList, type AxText } from "@/features/kakaotalk/server/chatList";

const text = (value: string): AxText => ({ role: "AXStaticText", text: value });
const area = (value: string): AxText => ({ role: "AXTextArea", text: value });
const at = { table: 0, row: 0 };

describe("isChatTime", () => {
  it.each(["오후 3:12", "오전 9:05", "3:12 PM", "15:12", "어제", "Yesterday", "월요일", "Monday", "11월 3일", "2025. 11. 3.", "11/3", "Nov 3", "15 Nov", "2:43 pm", "10:47 am", "10:47\u202fam"])("reads %s as a time", (value) => {
    expect(isChatTime(value)).toBe(true);
  });

  it.each(["홍길동", "3", "회의 3시에 해요"])("does not read %s as a time", (value) => {
    expect(isChatTime(value)).toBe(false);
  });
});

describe("parseChatRow", () => {
  it("reads a group chat with its member count, message, time and unread badge", () => {
    expect(parseChatRow([text("프로젝트 팀"), text("5"), area("내일 회의 3시에 해요"), text("오후 3:12"), text("12")], at)).toEqual({
      name: "프로젝트 팀",
      members: 5,
      lastMessage: "내일 회의 3시에 해요",
      time: "오후 3:12",
      unread: 12,
      at,
    });
  });

  it("reads a 1:1 chat with no badge", () => {
    expect(parseChatRow([{ role: "AXImage", text: "profile" }, text("엄마"), area("밥 먹었어?"), text("어제")], at)).toMatchObject({
      name: "엄마",
      members: undefined,
      lastMessage: "밥 먹었어?",
      time: "어제",
      unread: undefined,
    });
  });

  it("takes the longest other text as the message when the app gives no text view", () => {
    expect(parseChatRow([text("친구"), text("ok"), text("사진을 보냈습니다."), text("11월 3일")], at)?.lastMessage).toBe("사진을 보냈습니다.");
  });

  it("reads a row as the app lays it out: name, member count, time, then the message", () => {
    expect(parseChatRow([text("가족"), text("3"), text("10:45 am"), area("저녁 7시")], at)).toMatchObject({ name: "가족", members: 3, time: "10:45 am", lastMessage: "저녁 7시", unread: undefined });
  });

  it("reads a 999+ badge", () => {
    expect(parseChatRow([text("단톡방"), text("120"), area("ㅋㅋ"), text("15:00"), text("999+")], at)?.unread).toBe(999);
  });

  it("skips rows with only a name, like a header or a friend", () => {
    expect(parseChatRow([text("즐겨찾기")], at)).toBeUndefined();
    expect(parseChatRow([], at)).toBeUndefined();
  });
});

describe("pickChatList", () => {
  it("picks the table whose rows carry times, remembering where each chat is", () => {
    const friends = { rows: [[text("홍길동"), text("상태 메시지")], [text("김철수")]] };
    const chats = { rows: [[text("홍길동"), area("안녕"), text("오후 1:00")], [text("팀"), text("4"), area("ㅇㅋ"), text("어제"), text("2")]] };
    const picked = pickChatList([friends, chats]);
    expect(picked?.map((chat) => [chat.name, chat.at])).toEqual([
      ["홍길동", { table: 1, row: 0 }],
      ["팀", { table: 1, row: 1 }],
    ]);
  });

  it("keeps each table's place when the chat list is not the first one found, as in a window with nested groups", () => {
    // Synthetic rows shaped like a list found by searching groups: a friends outline (names only) before the chats.
    const friends = { rows: [[text("친구 A")], [text("친구 B")]] };
    const chatsTable = {
      rows: [
        [text("방 하나"), text("10:47\u202fam"), area("메시지 하나")],
        [text("방 둘"), text("3"), text("Yesterday"), area("메시지 둘")],
        [text("방 셋"), text("Nov 25"), area("메시지 셋")],
      ],
    };
    const chats = pickChatList([friends, chatsTable]);
    expect(chats?.map((chat) => [chat.name, chat.time, chat.at])).toEqual([
      ["방 하나", "10:47\u202fam", { table: 1, row: 0 }],
      ["방 둘", "Yesterday", { table: 1, row: 1 }],
      ["방 셋", "Nov 25", { table: 1, row: 2 }],
    ]);
  });

  it("reads rows whose texts were collected from deeper elements, including text fields", () => {
    const row = [{ role: "AXTextField", text: "방 이름" }, text("오후 3:12"), area("메시지")];
    expect(pickChatList([{ rows: [row] }])).toEqual([{ name: "방 이름", members: undefined, lastMessage: "메시지", time: "오후 3:12", unread: undefined, at }]);
  });

  it("finds no chat list when nothing has a time", () => {
    expect(pickChatList([{ rows: [[text("홍길동"), text("상태 메시지")]] }])).toBeUndefined();
    expect(pickChatList([])).toBeUndefined();
  });
});

describe("parseDockBadge", () => {
  it("reads the badge count, an empty badge as zero, and nothing when the app is not running", () => {
    expect(parseDockBadge('"StatusLabel"={ "label"="12" }')).toBe(12);
    expect(parseDockBadge('"StatusLabel"={ "label"=kCFNULL }')).toBe(0);
    expect(parseDockBadge("")).toBeUndefined();
  });
});
