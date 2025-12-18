/**
 * Simple ANSI color utilities - replaces chalk dependency
 */

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

function colorize(color: keyof typeof ANSI, text: string): string {
  // Skip colors if NO_COLOR env is set or stdout is not a TTY
  if (process.env.NO_COLOR || !process.stdout.isTTY) {
    return text;
  }
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

export const colors = {
  red: (text: string) => colorize('red', text),
  green: (text: string) => colorize('green', text),
  yellow: (text: string) => colorize('yellow', text),
  blue: (text: string) => colorize('blue', text),
  magenta: (text: string) => colorize('magenta', text),
  cyan: (text: string) => colorize('cyan', text),
  gray: (text: string) => colorize('gray', text),
  white: (text: string) => colorize('white', text),
};
