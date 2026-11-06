import { describe, expect, it } from "vitest";
import { locate, violation } from "./check-boundaries.mjs";

/** Why the module at `from` may not import the one at `to`, both as paths under `src/`. */
const why = (from, to) => violation(locate(from), locate(to));

describe("locate", () => {
  it("finds a feature's name and layer, and counts proxy as app", () => {
    expect(locate("features/tools/slack/server/slackApi")).toEqual({ area: "features", feature: "tools", layer: "server" });
    expect(locate("features/todos/TodoThing")).toEqual({ area: "features", feature: "todos", layer: "?" });
    expect(locate("proxy")).toEqual({ area: "app" });
  });
});

describe("violation", () => {
  it.each([
    ["app/api/todos/route", "composition/server"],
    ["composition/server", "features/todos/server/TodoStore"],
    ["features/todos/server/TodoStore", "features/sessions/model/Agent"],
    ["features/todos/server/TodoStore", "platform/paths"],
    ["features/todos/ui/TodoTab", "shell/shellContext"],
    ["features/tools/slack/ui/SlackTab", "features/tools/ui/toolPane"],
    ["features/tools/slack/server/slackSource", "features/tools/linear/server/linearApi"],
    ["shell/questions", "features/sessions/model/Agent"],
    ["workbench/registry", "features/todos/ui/TodoTab"],
    ["ui/CopyButton", "lib/errors"],
  ])("lets %s import %s", (from, to) => {
    expect(why(from, to)).toBeUndefined();
  });

  it.each([
    ["features/todos/ui/TodoTab", "composition/server", "only routes use the composition root"],
    ["features/todos/server/TodoStore", "features/sessions/server/AgentStore", "server code reaches into sessions's server"],
    ["features/todos/ui/TodoTab", "features/sessions/ui/SessionView", "UI reaches into sessions's UI"],
    ["features/todos/ui/TodoTab", "features/todos/server/TodoStore", "UI never uses server code"],
    ["features/todos/ui/TodoTab", "platform/paths", "UI never uses server code"],
    ["features/todos/model/Todo", "features/todos/ui/TodoTab", "models may only use models"],
    ["features/todos/model/Todo", "shell/tabs", "models stay free of UI and server code"],
    ["features/todos/ui/TodoTab", "workbench/registry", "features never use the app or the workbench"],
    ["composition/server", "features/todos/ui/TodoTab", "the composition root builds server objects only"],
    ["shell/Markdown", "features/tools/ui/toolPane", "shell may use shared UI and feature models only"],
    ["workbench/registry", "features/todos/server/TodoStore", "workbench is client code: no server modules"],
    ["ui/CopyButton", "shell/shellContext", "shared UI may only use shared UI"],
    ["platform/paths", "features/todos/model/Todo", "platform may only use platform"],
    ["lib/errors", "ui/notices", "lib holds pure helpers and may only use itself"],
  ])("refuses %s importing %s", (from, to, reason) => {
    expect(why(from, to)).toBe(reason);
  });
});
