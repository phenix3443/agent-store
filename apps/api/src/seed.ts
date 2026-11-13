// Nothing to seed: the catalog moved to catalog.db and the Postgres items tables are
// gone. Kept as a no-op because the test environment's init container still runs
// `bun src/migrate.ts && bun src/seed.ts` (home-lab projects/agent-store/test/api.yaml);
// delete it together with that command.
export {}
