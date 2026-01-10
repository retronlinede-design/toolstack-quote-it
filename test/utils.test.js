import { describe, it, expect } from 'vitest';
import { uid, safeParse, moneyFmt, toNumberOrNull, buildRFQSubject, buildRFQBody, norm } from '../src/lib/utils';

describe('utils', () => {
  it('uid returns a non-empty string', () => {
    const id = uid('x');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('safeParse returns fallback on invalid input', () => {
    expect(safeParse('not-json', { a: 1 })).toEqual({ a: 1 });
  });

  it('moneyFmt formats numbers', () => {
    expect(moneyFmt(3)).toBe('3.00');
    expect(moneyFmt('4.5')).toBe('4.50');
    expect(moneyFmt(null)).toBe('-');
  });

  it('toNumberOrNull works', () => {
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull('12.3')).toBe(12.3);
    expect(toNumberOrNull('abc')).toBeNull();
  });

  it('buildRFQSubject and body produce expected strings', () => {
    const rfq = { subjectPrefix: 'RFQ' };
    const request = { title: 'Thing', reference: 'PR-1' };
    const vendor = { name: 'Acme' };
    const subj = buildRFQSubject({ rfq, request, vendor });
    expect(subj).toContain('RFQ');
    expect(subj).toContain('PR-1');

    const body = buildRFQBody({ profile: { org: 'Org', user: 'User' }, rfq: { greeting: 'Hi', closing: 'Bye', include: {}, signatureName: 'User' }, request, vendor });
    expect(body).toContain('Please provide a quotation');
    expect(body).toContain('Title: Thing');
  });

  it('norm trims strings', () => {
    expect(norm('  abc  ')).toBe('abc');
  });
});