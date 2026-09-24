"use client";

import { GmailInbox } from "@/components/GoogleInbox";
import { useAccount } from "@/lib/app-state";

export default function GmailPage() {
  const { account, signOut } = useAccount();

  return <div className="grid gap-5">
    <div>
      <h1 className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em]">My Gmail · Latest 50</h1>
      <p className="mt-1 text-ink-2">View the latest 50 saved Inbox emails{account?.id !== 'sample' ? ` for ${account?.email ?? ''}` : ''}. Sync Gmail fetches current messages from your Google account.</p>
    </div>
    {account?.id === "sample"
      ? <section className="card p-6"><h2 className="font-medium">Google account required</h2><p className="mt-2 text-ink-2">Sign out of the demo mailbox, then continue with Google to sync Gmail.</p></section>
      : <GmailInbox onExpired={() => void signOut()} />}
  </div>;
}
