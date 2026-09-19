import { opsTokenFromSearch, requireOpsToken } from "@/lib/ops";
import { OpsList } from "./OpsList";

export const dynamic = "force-dynamic";

export default async function OpsQueryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  requireOpsToken(opsTokenFromSearch(params));
  return <OpsList />;
}
