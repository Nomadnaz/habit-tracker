import { describe, expect, it } from 'vitest';
import { authErrorText, looksLikeEmail, parseAuthFragment, passwordProblem } from './auth-links';

describe('passwordProblem', () => {
  it('wants 8+ characters with letters and a number', () => {
    expect(passwordProblem('abc1')).toMatch(/8 characters/);
    expect(passwordProblem('abcdefgh')).toMatch(/number/);
    expect(passwordProblem('12345678')).toMatch(/letters/);
    expect(passwordProblem('puckpass9')).toBeNull();
  });
  it('checks the confirmation when given', () => {
    expect(passwordProblem('puckpass9', 'puckpass8')).toMatch(/match/);
    expect(passwordProblem('puckpass9', 'puckpass9')).toBeNull();
  });
});

describe('parseAuthFragment', () => {
  it('reads the tokens after the #', () => {
    const f = parseAuthFragment('habittracker://auth-callback#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=signup');
    expect(f).toEqual({ accessToken: 'a.b.c', refreshToken: 'r1', type: 'signup', error: undefined });
  });
  it('reads an expired-link error from either place', () => {
    expect(parseAuthFragment('https://x/auth/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired').error)
      .toBe('Email link is invalid or has expired');
    expect(parseAuthFragment('https://x/auth/?error=access_denied').error).toBe('access_denied');
  });
  it('is empty for nothing', () => {
    expect(parseAuthFragment(null)).toEqual({});
    expect(parseAuthFragment('habittracker://auth-callback').accessToken).toBeUndefined();
  });
});

describe('helpers', () => {
  it('spots emails', () => {
    expect(looksLikeEmail(' a@b.co ')).toBe(true);
    expect(looksLikeEmail('a@b')).toBe(false);
  });
  it('rewords common errors', () => {
    expect(authErrorText('Invalid login credentials')).toMatch(/don't match/);
    expect(authErrorText('Email not confirmed')).toMatch(/Confirm your email/);
    expect(authErrorText('something else')).toBe('something else');
  });
});
