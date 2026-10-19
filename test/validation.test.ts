import { describe, expect, it } from 'vitest';
import { consoleEndpoints } from '../src/commands/console.js';
import { detectPackageManager, needsNvmReshim } from '../src/commands/update.js';
import { compareVersions, isCheckDue, pendingUpdate } from '../src/core/update-checker.js';
import { formatElapsed, isAwsRegion, parseDuration, parseMfaCode, parseSessionDuration } from '../src/core/util.js';

describe('parseDuration', () => {
  it('accepts whole seconds within the STS range', () => {
    expect(parseDuration(undefined)).toBeUndefined();
    expect(parseDuration('3600')).toBe(3600);
    expect(parseDuration('900')).toBe(900);
    expect(parseDuration('129600')).toBe(129_600);
  });

  // These reached AWS as NaN or out of range and came back as a vague ValidationError.
  it.each(['1h', 'abc', '60', '200000', '1.5', ''])('rejects %j', (value) => {
    expect(() => parseDuration(value)).toThrow(/--duration/);
  });
});

describe('parseMfaCode', () => {
  it('accepts six digits, trimmed', () => {
    expect(parseMfaCode(' 123456 ')).toBe('123456');
  });

  it.each(['12345', '1234567', '12a456', ''])('rejects %j', (value) => {
    expect(() => parseMfaCode(value)).toThrow(/6 digits/);
  });
});

describe('isAwsRegion', () => {
  it.each(['us-east-1', 'eu-central-2', 'ap-southeast-4', 'us-gov-west-1', 'cn-north-1', 'us-isob-east-1'])(
    'accepts %s',
    (region) => expect(isAwsRegion(region)).toBe(true),
  );

  it.each(['us-east1', 'useast-1', 'US-EAST-1', 'us-east-', ''])('rejects %j', (region) => {
    expect(isAwsRegion(region)).toBe(false);
  });
});

describe('consoleEndpoints', () => {
  it('uses the partition of the region', () => {
    expect(consoleEndpoints('eu-west-1').signin).toBe('https://signin.aws.amazon.com');
    expect(consoleEndpoints('cn-north-1').signin).toBe('https://signin.amazonaws.cn');
    expect(consoleEndpoints('us-gov-west-1').signin).toBe('https://signin.amazonaws-us-gov.com');
    expect(consoleEndpoints('eu-west-1').console).toBe(
      'https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1',
    );
  });
});

describe('update check', () => {
  it('compares versions numerically, a release above its prereleases', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('garbage', '1.0.0')).toBeNull();
  });

  it('announces only a strictly newer version', () => {
    expect(pendingUpdate({ lastCheck: 0, latest: '0.4.0' }, '0.3.4')).toBe('0.4.0');
    expect(pendingUpdate({ lastCheck: 0, latest: '0.3.4' }, '0.3.4')).toBeNull();
    expect(pendingUpdate({ lastCheck: 0 }, '0.3.4')).toBeNull();
    expect(pendingUpdate(null, '0.3.4')).toBeNull();
  });

  it('asks the registry at most once a day', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(isCheckDue(null, day)).toBe(true);
    expect(isCheckDue({ lastCheck: 1 }, day)).toBe(false);
    expect(isCheckDue({ lastCheck: 0 }, day)).toBe(true);
  });
});

// NVM for Windows 2.x blocked awswiz right after `awswiz update` (NVM4306)
// until `nvm reshim`; the update says so only where that can happen.
describe('needsNvmReshim', () => {
  const nvm2 = 'C:\\Users\\me\\AppData\\Local\\Author Software\\nvm\\installs\\v24.21.0\\node_modules\\@fsichi\\awswiz\\dist\\main.js';

  it('flags an NVM for Windows 2.x install', () => {
    expect(needsNvmReshim(nvm2, 'win32')).toBe(true);
  });

  it.each([
    ['nvm-windows 1.x (no reshim)', 'C:\\Users\\me\\AppData\\Roaming\\nvm\\v20.11.0\\node_modules\\@fsichi\\awswiz\\dist\\main.js', 'win32'],
    ['a plain Node install', 'C:\\Program Files\\nodejs\\node_modules\\@fsichi\\awswiz\\dist\\main.js', 'win32'],
    ['nvm on macOS/Linux', '/home/me/.nvm/versions/node/v24.0.0/lib/node_modules/@fsichi/awswiz/dist/main.js', 'linux'],
    ['the same path off Windows', nvm2, 'linux'],
  ] as const)('stays quiet for %s', (_label, path, platform) => {
    expect(needsNvmReshim(path, platform)).toBe(false);
  });
});

describe('detectPackageManager', () => {
  it.each([
    ['C:\\Users\\me\\AppData\\Local\\Author Software\\nvm\\installs\\v24.21.0\\node_modules\\@fsichi\\awswiz\\dist\\main.js', 'npm'],
    ['/usr/local/lib/node_modules/@fsichi/awswiz/dist/main.js', 'npm'],
    ['/home/me/.local/share/pnpm/global/5/node_modules/@fsichi/awswiz/dist/main.js', 'pnpm'],
    ['C:\\Users\\me\\AppData\\Local\\Yarn\\Data\\global\\node_modules\\@fsichi\\awswiz\\dist\\main.js', 'yarn'],
    ['/home/me/.bun/install/global/node_modules/@fsichi/awswiz/dist/main.js', 'bun'],
  ])('%s → %s', (path, expected) => {
    expect(detectPackageManager(path)).toBe(expected);
  });
});

describe('parseSessionDuration', () => {
  const H = 3_600_000;
  it('reads the lengths Identity Center allows', () => {
    expect(parseSessionDuration('8h')).toBe(8 * H);
    expect(parseSessionDuration(' 12h 30m ')).toBe(12.5 * H);
    expect(parseSessionDuration('1d')).toBe(24 * H);
    expect(parseSessionDuration('90d')).toBe(90 * 24 * H);
    expect(parseSessionDuration('15m')).toBe(H / 4);
  });

  // A typo must never invent an end time.
  it('rejects anything else', () => {
    for (const bad of [undefined, '', '8', 'eight hours', '10m', '91d', '8h-1m', '1.5h']) {
      expect(parseSessionDuration(bad)).toBeNull();
    }
  });
});

describe('formatElapsed', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  it('says how long ago, in the largest useful units', () => {
    expect(formatElapsed(new Date(now - 5 * 60_000), now)).toBe('5m');
    expect(formatElapsed(new Date(now - 190 * 60_000), now)).toBe('3h 10m');
    expect(formatElapsed(new Date(now - 50 * 3_600_000), now)).toBe('2d 2h');
    expect(formatElapsed(new Date(now + 60_000), now)).toBe('0m');
  });
});
