const actionOwnedArguments = new Set([
  '--config',
  '--list',
  '--reporter',
  '--shard',
]);

const supportedValueArguments = new Map([
  ['--project', '--project'],
  ['--grep', '--grep'],
  ['-g', '--grep'],
  ['--grep-invert', '--grep-invert'],
]);

function argumentName(argument: string): string {
  const equals = argument.indexOf('=');
  return equals === -1 ? argument : argument.slice(0, equals);
}

function splitOptionLine(argument: string): never {
  const match =
    /^(--project|--grep|--grep-invert|-g|--only-changed)\s+(.+)$/.exec(
      argument,
    );
  if (match === null) {
    throw new Error(`unsupported playwright argument: ${argument}`);
  }
  const rawName = match[1];
  const value = match[2];
  if (rawName === undefined || value === undefined) {
    throw new Error(`unsupported playwright argument: ${argument}`);
  }
  const name = rawName === '-g' ? '--grep' : rawName;
  throw new Error(`one argument per line; use ${name}=${value}`);
}

export function parseArgumentLines(input: string): string[] {
  const arguments_ = input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const argument of arguments_) {
    const name = argumentName(argument);
    if (actionOwnedArguments.has(name)) {
      throw new Error(
        `action-owned playwright argument is not allowed: ${name}`,
      );
    }
    if (
      /\s/u.test(argument) &&
      argument.startsWith('-') &&
      !argument.includes('=')
    ) {
      splitOptionLine(argument);
    }
    if (argument.startsWith('-')) {
      const supportedValueName = supportedValueArguments.get(name);
      const supported =
        supportedValueName !== undefined || name === '--only-changed';
      if (!supported) {
        throw new Error(`unsupported playwright argument: ${argument}`);
      }
      if (
        supportedValueName !== undefined &&
        !argument.startsWith(`${name}=`)
      ) {
        throw new Error(
          `one argument per line; use ${supportedValueName}=value`,
        );
      }
      if (argument.endsWith('=')) {
        throw new Error(`${name} requires a value`);
      }
    }
  }

  return arguments_;
}

const normalizedValueArguments = new Map([...supportedValueArguments]);
const descriptorOwnedArguments = new Set(['--config', '--shard']);

function readRequiredValue(
  argv: readonly string[],
  index: number,
  name: string,
): { value: string; nextIndex: number } {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`${name} requires a value`);
  }
  return { value, nextIndex: index + 1 };
}

export function normalizeSelectionArgv(argv: readonly string[]): string[] {
  const normalized: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }
    const name = argumentName(argument);
    if (name === '--list') {
      continue;
    }
    if (name === '--reporter') {
      if (argument === '--reporter') {
        const { nextIndex } = readRequiredValue(argv, index, name);
        index = nextIndex;
      }
      continue;
    }
    if (descriptorOwnedArguments.has(name)) {
      if (argument.includes('=')) {
        if (argument.endsWith('=')) {
          throw new Error(`${name} requires a value`);
        }
      } else {
        const { nextIndex } = readRequiredValue(argv, index, name);
        index = nextIndex;
      }
      continue;
    }

    const canonicalName = normalizedValueArguments.get(name);
    if (canonicalName !== undefined) {
      if (argument.includes('=')) {
        const value = argument.slice(argument.indexOf('=') + 1);
        if (value.length === 0) {
          throw new Error(`${canonicalName} requires a value`);
        }
        normalized.push(`${canonicalName}=${value}`);
      } else {
        const { value, nextIndex } = readRequiredValue(argv, index, name);
        normalized.push(`${canonicalName}=${value}`);
        index = nextIndex;
      }
      continue;
    }

    if (name === '--only-changed' && argument === '--only-changed') {
      const candidate = argv[index + 1];
      if (candidate !== undefined && !candidate.startsWith('-')) {
        normalized.push(`--only-changed=${candidate}`);
        index += 1;
      } else {
        normalized.push('--only-changed');
      }
      continue;
    }
    normalized.push(argument);
  }

  return normalized.sort((left, right) => left.localeCompare(right));
}
