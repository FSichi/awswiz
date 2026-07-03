import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ssoCacheKeySource, ssoCachePath } from '../src/core/sso.js';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

// The aws CLI / SDK contract: session-based logins are cached under the SHA-1 of
// the session NAME; legacy logins under the SHA-1 of the start URL. Getting this
// wrong is the "login succeeds but nothing sees it" bug that shipped in 0.1.2.
describe('sso cache key', () => {
  it('uses the session name for modern (sso_session) configs', () => {
    expect(
      ssoCacheKeySource({ sessionName: 'boostivity', startUrl: 'https://x.awsapps.com/start' }),
    ).toBe('boostivity');
  });

  it('uses the start URL for legacy configs', () => {
    expect(
      ssoCacheKeySource({ sessionName: null, startUrl: 'https://x.awsapps.com/start' }),
    ).toBe('https://x.awsapps.com/start');
  });

  it('maps the key source to the sha1-named cache file', () => {
    expect(ssoCachePath('boostivity').endsWith(`${sha1('boostivity')}.json`)).toBe(true);
    const url = 'https://my-org.awsapps.com/start';
    expect(ssoCachePath(url).endsWith(`${sha1(url)}.json`)).toBe(true);
  });

  it('session-name and start-URL keys never collide', () => {
    expect(ssoCachePath('boostivity')).not.toBe(ssoCachePath('https://boostivity.awsapps.com/start'));
  });
});
