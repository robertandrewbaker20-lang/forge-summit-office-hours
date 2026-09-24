import { requireOpsToken } from "@/lib/ops";
import { OpsList } from "../OpsList";

export const dynamic = "force-dynamic";

export default async function OpsTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  requireOpsToken(token);
  return <OpsList />;
}
