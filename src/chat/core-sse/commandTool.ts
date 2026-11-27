export type CommandToolName = 'BASH' | 'EXECUTE_SHELL_COMMAND' | 'EXECUTE_PYTHON_CODE';

const COMMAND_TOOL_NAMES = new Set<CommandToolName>([
  'BASH',
  'EXECUTE_SHELL_COMMAND',
  'EXECUTE_PYTHON_CODE',
]);

export function getCommandToolName(name: unknown): CommandToolName | undefined {
  if (typeof name !== 'string') return undefined;
  const normalized = name.toUpperCase();
  return COMMAND_TOOL_NAMES.has(normalized as CommandToolName)
    ? (normalized as CommandToolName)
    : undefined;
}
