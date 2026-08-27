/**
 * The dev-only signing key, in one place.
 *
 * index.ts SIGNS the fixture JWT with it and token.ts VERIFIES with it. Two
 * copies of the same literal drift — and the failure is silent, because a
 * mismatched secret makes `getToken` return null, which reads exactly like
 * "nobody is signed in". Its own module so that verifying a token does not
 * drag the whole NextAuth setup in behind it.
 *
 * Public on purpose: it only ever guards fixture data, and the same flag that
 * turns off the fake provider refuses this key in live mode.
 */
export const FIXTURE_SECRET = "bee-fixture-not-a-secret";
