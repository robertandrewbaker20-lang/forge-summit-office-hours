/** Run the idempotent additive migrations in lib/schema.ts. */
import { ensureSchema } from "../lib/schema";
import { getPool } from "../lib/db";

ensureSchema()
  .then(async () => {
    console.log("Migrations complete");
    await getPool().end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
