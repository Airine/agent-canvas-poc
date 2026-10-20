/** Quote a single POSIX shell argument; never use for executable shell source. */
export function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export function exitWrapper(command: string, exitFile: string): string {
  return `${command}; printf '%s' $? > ${shellQuote(exitFile)}`;
}
