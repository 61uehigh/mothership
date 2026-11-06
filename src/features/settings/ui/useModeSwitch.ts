"use client";

import { useCallback, useEffect, useState } from "react";
import { writeCachedTest } from "@/features/settings/ui/connectionCache";
import type { ConnectionMode, ConnectionTest, ConnectionView } from "@/features/settings/model/Settings";
import { fetchJson, jsonRequest } from "@/ui/useJson";

/** A save that failed leaves the mode as it was; the pick stops showing after this long. */
const PENDING_MS = 6000;

/**
 * ### ModeSwitch
 *
 * What {@link useModeSwitch} gives a connection card.
 */
export type ModeSwitch = {
  /** The mode you just picked, shown at once while it saves (a save takes a second or two). */
  pendingMode: ConnectionMode | undefined;
  /** Switching a working connection: the mode being set up here before it replaces the current one. */
  switchTo: ConnectionMode | undefined;
  /** The new mode is saved and being tested. */
  switching: boolean;
  /** Why the last switch was rolled back. */
  switchFailure: Extract<ConnectionTest, { ok: false }> | undefined;
  /** Rolling back failed too, so the mode that failed its test is still saved; the save's error. */
  revertError: string | undefined;
  /** Why the last mode save failed; cleared by the next one. */
  saveError: string | undefined;
  /** Saves a mode as it is, keeping the error for {@link ModeSwitch.saveError}. */
  save: (mode: ConnectionMode | "default") => Promise<void>;
  /** Picks a mode: a working connection asks first (`switchTo`); anything else saves at once. */
  choose: (next: ConnectionMode | "default") => void;
  /** Saves `switchTo`, tests it, and keeps it only if the test passes; otherwise puts the old mode back. */
  testAndSwitch: () => Promise<void>;
  /** Turns the connection off from the switch's confirmation. */
  turnOff: () => void;
  cancel: () => void;
  /** Forgets a pending pick, e.g. once the saved mode arrives. */
  clearPending: () => void;
};

/**
 * ### useModeSwitch
 *
 * Changing how one connection connects. A connection that works is not
 * switched blindly: the new way is set up on the card and tested first.
 *
 * @param connected - The card's chip says connected now.
 * @param onMode - Saves a mode; resolves to an error message, or `undefined`.
 * @param onSwitched - Called with the passing test of a mode just switched to.
 */
export function useModeSwitch(
  connection: ConnectionView,
  connected: boolean,
  onMode: (mode: ConnectionMode | "default") => Promise<string | undefined>,
  onSwitched: (test: ConnectionTest) => void,
): ModeSwitch {
  const [pendingMode, setPendingMode] = useState<ConnectionMode | undefined>(undefined);
  const [switchTo, setSwitchTo] = useState<ConnectionMode | undefined>(undefined);
  const [switching, setSwitching] = useState(false);
  const [switchFailure, setSwitchFailure] = useState<ModeSwitch["switchFailure"]>(undefined);
  const [revertError, setRevertError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (pendingMode === undefined) return;
    const timer = setTimeout(() => setPendingMode(undefined), PENDING_MS);
    return () => clearTimeout(timer);
  }, [pendingMode]);

  /** Every step starts over: an earlier step's failure no longer describes the card. */
  function clearFailures() {
    setSwitchFailure(undefined);
    setRevertError(undefined);
    setSaveError(undefined);
  }

  function cancel() {
    setSwitchTo(undefined);
    clearFailures();
  }

  async function save(mode: ConnectionMode | "default") {
    clearFailures();
    const error = await onMode(mode);
    if (error === undefined) return;
    setSaveError(error);
    setPendingMode(undefined);
  }

  function choose(next: ConnectionMode | "default") {
    if (next === connection.mode) return cancel();
    if (next !== "default" && connected) {
      setSwitchTo(next);
      clearFailures();
      return;
    }
    if (next !== "default") setPendingMode(next);
    void save(next);
  }

  async function testAndSwitch() {
    if (switchTo === undefined) return;
    const target = switchTo;
    const back: ConnectionMode | "default" = connection.chosen ? connection.mode : "default";
    setSwitching(true);
    clearFailures();
    const targetError = await onMode(target);
    if (targetError !== undefined) {
      setSwitching(false);
      setSwitchFailure({ ok: false, message: targetError });
      return;
    }
    const result = await fetchJson<ConnectionTest>("/api/settings/test", jsonRequest("POST", { id: connection.id }));
    const done: ConnectionTest = result.ok ? result.data : { ok: false, message: result.error };
    if (done.ok) {
      writeCachedTest(connection.id, target, done);
      onSwitched(done);
      setSwitchTo(undefined);
    } else {
      setRevertError(await onMode(back));
      setSwitchFailure(done);
    }
    setSwitching(false);
  }

  function turnOff() {
    setSwitchTo(undefined);
    setPendingMode("off");
    void save("off");
  }

  const clearPending = useCallback(() => setPendingMode(undefined), []);
  return { pendingMode, switchTo, switching, switchFailure, revertError, saveError, save, choose, testAndSwitch, turnOff, cancel, clearPending };
}
