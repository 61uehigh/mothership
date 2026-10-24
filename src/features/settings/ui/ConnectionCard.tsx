"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { CONNECTION_INFO } from "@/features/settings/ui/connectionInfo";
import { SecretField } from "@/features/settings/ui/SecretField";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { fetchJson } from "@/ui/useJson";
import type { ConnectionMode, ConnectionTest, ConnectionView } from "@/features/settings/model/Settings";

const MODE_LABELS: Record<ConnectionMode, string> = { mcp: "Token", claude: "Claude connector", off: "Off" };
const MODE_TITLES: Record<ConnectionMode, string> = {
  mcp: "The tool's own MCP server with your token: free, fast, and usable by every agent",
  claude: "The claude.ai connector you connected in Claude: no token, but Claude agents only, and each refresh uses a little Claude usage",
  off: "Not used",
};

/**
 * ### ConnectionCard
 *
 * One tool in Settings: how it connects, the token it needs, and a test.
 *
 * @param onMode - Saves a mode; `default` hands the choice back to the config files.
 * @param onSecret - Saves one `.env.local` value; resolves to an error message, or `undefined`.
 */
export function ConnectionCard({
  connection,
  locked,
  onMode,
  onSecret,
}: {
  connection: ConnectionView;
  /** A custom MCP config (demo mode) is in use, so choices here would not apply. */
  locked: boolean;
  onMode: (mode: ConnectionMode | "default") => void;
  onSecret: (name: string, value: string) => Promise<string | undefined>;
}) {
  const info = CONNECTION_INFO[connection.id];
  const Icon = info.icon;
  const [test, setTest] = useState<ConnectionTest | "running" | undefined>(undefined);
  const missing = connection.mode === "mcp" && connection.secrets.some((s) => !s.set);

  async function runTest() {
    setTest("running");
    const result = await fetchJson<ConnectionTest>("/api/settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: connection.id }),
    });
    setTest(result.ok ? result.data : { ok: false, message: result.error });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-wrap items-center gap-2">
        <Icon size={16} aria-hidden />
        <h3 className="text-sm font-medium">{info.label}</h3>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] ${
            connection.mode === "off" || missing
              ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              : "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
          }`}
        >
          {connection.mode === "off" ? "Off" : missing ? "Needs a token" : connection.mode === "mcp" ? "Token" : "Claude connector"}
        </span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {connection.chosen && !locked && (
            <button type="button" className="whitespace-nowrap text-[11px] text-zinc-500 hover:underline" onClick={() => onMode("default")}>
              Reset to config files
            </button>
          )}
          <SegmentedControl
            label={`How ${info.label} connects`}
            value={connection.mode}
            disabled={locked}
            options={connection.modes.map((mode) => ({ value: mode, label: MODE_LABELS[mode], title: MODE_TITLES[mode] }))}
            onChange={onMode}
            className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
            optionClassName={(selected) =>
              `whitespace-nowrap rounded px-2 py-0.5 text-xs ${selected ? "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`
            }
          />
        </span>
      </header>

      {connection.mode === "mcp" && (
        <div className="flex flex-col gap-2">
          {connection.secrets.map((secret) => {
            const field = info.fields[secret.name];
            return field === undefined ? (
              <p key={secret.name} className="text-xs text-zinc-500">
                Set <code className="font-mono">{secret.name}</code> in <code className="font-mono">.env.local</code> ({secret.set ? "set" : "not set"}).
              </p>
            ) : (
              <SecretField
                key={secret.name}
                secret={secret}
                label={field.label}
                placeholder={field.placeholder}
                kind={field.kind}
                onSave={(value) => onSecret(secret.name, value)}
              />
            );
          })}
          <p className="text-xs leading-relaxed text-zinc-500">{info.howTo}</p>
        </div>
      )}
      {connection.mode === "claude" && (
        <p className="text-xs leading-relaxed text-zinc-500">
          Uses the <strong className="font-medium text-zinc-700 dark:text-zinc-300">{connection.connector}</strong> connector of your Claude login. Connect it at{" "}
          <a className="text-teal-700 underline underline-offset-2 dark:text-teal-400" href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">
            claude.ai → Settings → Connectors
          </a>
          . Only Claude agents can use it, and each sidebar refresh uses a little Claude usage.
        </p>
      )}

      {connection.mode !== "off" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            disabled={test === "running" || missing}
            onClick={() => void runTest()}
            className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Test connection
          </button>
          {test === "running" && <LoaderCircle size={13} className="animate-spin text-teal-500" aria-label="Testing" />}
          {test !== undefined && test !== "running" && (
            <span role="status" className={test.ok ? "text-green-700 dark:text-green-400" : "break-words text-red-600 dark:text-red-400"}>
              {test.ok ? `Connected · ${test.items} item${test.items === 1 ? "" : "s"} loaded` : test.message}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
