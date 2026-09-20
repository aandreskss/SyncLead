// No-op mock for the "server-only" package in Vitest.
// Next.js uses this package at compile time to prevent server modules from
// being bundled for the client. In tests there is no client/server boundary
// so we simply export nothing.
export {}
