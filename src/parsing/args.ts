export function split_pipe_args(raw_input: string): string[] {
  if (!raw_input.trim()) {
    return [];
  }
  return raw_input
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export interface ParsedKeyValue {
  positional: string[];
  flags: Record<string, string>;
}

export function parse_key_value_flags(raw_input: string): ParsedKeyValue {
  const parts = raw_input.trim().split(/\s+/).filter(Boolean);
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (const part of parts) {
    const eq_idx = part.indexOf("=");
    if (eq_idx > 0) {
      const key = part.slice(0, eq_idx).trim().toLowerCase();
      const val = part.slice(eq_idx + 1).trim();
      flags[key] = val;
    } else {
      positional.push(part);
    }
  }

  return { positional, flags };
}

export function extract_command_and_args(
  full_text: string,
  prefix: string = "/"
): { command: string; args_text: string } | null {
  const trimmed = full_text.trim();
  if (!trimmed.startsWith(prefix)) {
    return null;
  }

  const without_prefix = trimmed.slice(prefix.length).trim();
  if (!without_prefix) {
    return null;
  }

  const space_idx = without_prefix.indexOf(" ");
  if (space_idx === -1) {
    return {
      command: without_prefix.toLowerCase(),
      args_text: "",
    };
  }

  return {
    command: without_prefix.slice(0, space_idx).toLowerCase(),
    args_text: without_prefix.slice(space_idx + 1).trim(),
  };
}
