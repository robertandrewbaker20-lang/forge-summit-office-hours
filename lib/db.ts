import { neon, Pool } from "@neondatabase/serverless";
import { previewDatabaseUrl } from "./preview-env";

type Sql = ReturnType<typeof neon>;

let _sql: Sql | null = null;
let _pool: Pool | null = null;

function databaseUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    previewDatabaseUrl;
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
