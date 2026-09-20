import { redirect } from "next/navigation";

// The inbox and the overview merged into the queue at "/"; links already shared still land.
export default async function Inbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { case: id, ...rest } = await searchParams;
  const qs = new URLSearchParams(Object.entries(rest).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  redirect(typeof id === "string" ? `/case/${id}${qs.size ? `?${qs}` : ""}` : `/${qs.size ? `?${qs}` : ""}`);
}
