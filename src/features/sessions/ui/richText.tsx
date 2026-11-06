import { Fragment, type ReactNode } from "react";

/**
 * ### richText
 *
 * Puts elements into a translated message at its `{name}` slots, for text
 * whose word order differs by language around a bold name or a `<code>`
 * branch. Translate with each slot passed as itself, e.g.
 * `richText(t("x", { branch: "{branch}" }), { branch: <code>{name}</code> })`.
 *
 * @param text - The translated message, slots still in it.
 * @param parts - What goes in each slot; slots not named here stay as text.
 */
export function richText(text: string, parts: Record<string, ReactNode>): Array<ReactNode> {
  return text.split(/(\{\w+\})/).map((piece, index) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return name !== undefined && Object.hasOwn(parts, name) ? <Fragment key={index}>{parts[name]}</Fragment> : piece;
  });
}
