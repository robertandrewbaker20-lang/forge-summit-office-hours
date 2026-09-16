import { neon, Pool } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;

let _sql: Sql | null = null;
let _pool: Pool | null = null;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function getSql(): Sql {
  if (!_sql) {
    _sql = neon(databaseUrl());
  }
  return _sql;
}

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: databaseUrl() });
  }
  return _pool;
}
