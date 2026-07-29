import { describe, expect, it } from 'vitest';
import { browserCommandFor } from '../src/core/util.js';

// The 0.3.0/0.3.1 regression: cmd.exe split the PKCE sign-in URL at its first
// "&", so AWS only ever received response_type and answered "Client ID is
// required". Multi-parameter URLs must survive intact.
const SIGN_IN_URL =
  'https://oidc.us-east-1.amazonaws.com/authorize?response_type=code&client_id=abc123&redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Foauth%2Fcallback&state=xyz&code_challenge=chal&code_challenge_method=S256&scopes=sso%3Aaccount%3Aaccess';

describe('browserCommandFor', () => {
  it('escapes every & on Windows and passes the line verbatim', () => {
    const { command, args, verbatim } = browserCommandFor(SIGN_IN_URL, 'win32');
    const passed = args[args.length - 1]!;

    expect(command).toBe('cmd');
    expect(verbatim).toBe(true);
    expect(passed).not.toMatch(/(^|[^^])&/); // no unescaped "&" left
    expect(passed.match(/\^&/g)).toHaveLength(6); // one per parameter separator
    // Every parameter still made it through.
    expect(passed).toContain('client_id=abc123');
    expect(passed).toContain('code_challenge_method=S256');
    expect(passed.replace(/\^&/g, '&')).toBe(SIGN_IN_URL);
  });

  it('leaves the URL untouched on macOS and Linux', () => {
    expect(browserCommandFor(SIGN_IN_URL, 'darwin')).toEqual({
      command: 'open',
      args: [SIGN_IN_URL],
      verbatim: false,
    });
    expect(browserCommandFor(SIGN_IN_URL, 'linux')).toEqual({
      command: 'xdg-open',
      args: [SIGN_IN_URL],
      verbatim: false,
    });
  });

  it('handles single-parameter URLs (the device-code flow) unchanged', () => {
    const deviceUrl = 'https://device.sso.us-east-1.amazonaws.com/?user_code=MMZQ-BSQV';
    expect(browserCommandFor(deviceUrl, 'win32').args.at(-1)).toBe(deviceUrl);
  });
});
