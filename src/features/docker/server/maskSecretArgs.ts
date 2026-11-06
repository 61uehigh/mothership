const SECRET_NAME = /pass|pwd|secret|token|key|auth|credential/i;
const MASK = "•••";

function maskUrlPassword(arg: string): string {
  return arg.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)[^\s/@]+@/gi, `$1${MASK}@`);
}

/**
 * ### maskSecretArgs
 *
 * Hides the values a container's command line is likely to carry secrets
 * in, before it leaves the server (the command is drawn on screen, where a
 * screen share would show it). Masks the value of a flag whose name looks
 * secret (`--requirepass X`, `--token=X`), of a `NAME=value` pair with such a
 * name (`-c password=X`), and the password in a URL (`postgres://u:X@host`).
 * It errs toward masking: an innocent flag such as `--keyspace` is masked too.
 *
 * @returns The arguments in the same order, with secret values replaced by `•••`.
 */
export function maskSecretArgs(args: ReadonlyArray<string>): Array<string> {
  const masked: Array<string> = [];
  let maskNext = false;
  for (const arg of args) {
    if (maskNext && !arg.startsWith("-")) {
      masked.push(MASK);
      maskNext = false;
      continue;
    }
    maskNext = false;
    const flag = /^(-{1,2}[^=\s]+)(=.*)?$/.exec(arg);
    if (flag !== null && SECRET_NAME.test(flag[1] ?? "")) {
      if (flag[2] === undefined) maskNext = true;
      masked.push(flag[2] === undefined ? arg : `${flag[1]}=${MASK}`);
      continue;
    }
    const pair = /^([A-Za-z_][\w.-]*)=/.exec(arg);
    if (pair !== null && SECRET_NAME.test(pair[1] ?? "")) {
      masked.push(`${pair[1]}=${MASK}`);
      continue;
    }
    masked.push(maskUrlPassword(arg));
  }
  return masked;
}
