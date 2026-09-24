import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** Query-string ops access (?key=) is disabled. Use /ops/<OPS_SECRET> only. */
export default function OpsQueryPage() {
  notFound();
}
