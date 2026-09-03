import { describe, expect, it } from 'vitest';

import { protectionLevel, shouldWarnAboutPersistence } from './protection';

describe('protectionLevel', () => {
  it('is protected once the browser has granted persist()', () => {
    expect(protectionLevel(false, true)).toBe('protected');
    expect(protectionLevel(true, true)).toBe('protected');
  });

  it('is unknown before persist() has ever been asked', () => {
    expect(protectionLevel(false, null)).toBe('unknown');
    expect(protectionLevel(true, null)).toBe('unknown');
  });

  it('is at-risk only when neither installed nor persisted', () => {
    expect(protectionLevel(false, false)).toBe('at-risk');
  });

  it('is installed-unconfirmed when on the home screen but persist() still lags', () => {
    // This is the routine iOS case: persist() barely matters there, and being
    // installed is what actually protects the data.
    expect(protectionLevel(true, false)).toBe('installed-unconfirmed');
  });
});

describe('shouldWarnAboutPersistence', () => {
  it('warns only in the one state the shopkeeper can still fix', () => {
    expect(shouldWarnAboutPersistence(false, false, false)).toBe(true);
  });

  it('never warns once the app is installed, even if persisted lags', () => {
    // The regression this whole module exists to prevent: telling someone to
    // add the app to their home screen after they already have.
    expect(shouldWarnAboutPersistence(true, false, false)).toBe(false);
  });

  it('never warns once the browser has granted persistence', () => {
    expect(shouldWarnAboutPersistence(false, true, false)).toBe(false);
    expect(shouldWarnAboutPersistence(true, true, false)).toBe(false);
  });

  it('never warns before persist() has been asked', () => {
    expect(shouldWarnAboutPersistence(false, null, false)).toBe(false);
  });

  it('respects a dismissal even in the at-risk state', () => {
    expect(shouldWarnAboutPersistence(false, false, true)).toBe(false);
  });
});
