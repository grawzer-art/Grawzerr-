import Link from "next/link";

/** Shown when Supabase is not configured: the app runs as a visual preview only. */
export default function SetupNotice({ what }: { what: string }) {
  return (
    <div className="notice" role="status">
      <strong>Mode aperçu.</strong> {what} nécessite Supabase, qui n&apos;est pas encore configuré. Suivez{" "}
      <Link href="/dashboard">le diagnostic du Dashboard</Link> et le guide <span className="mono">docs/CONFIGURATION.md</span>.
    </div>
  );
}
