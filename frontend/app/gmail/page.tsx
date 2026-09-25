"use client";

import { GmailInbox } from "@/components/GoogleInbox";
import { useAccount } from "@/lib/app-state";

export default function GmailPage() {
  const { account, signOut } = useAccount();

  return <div className="grid gap-5">
    <div>
      <p className="max-w-2xl text-[14px] text-ink-2">View the latest 50 saved Inbox emails{account?.id !== 'sample' ? ` for ${account?.email ?? ''}` : ''}. Sync Gmail fetches current messages from your Google account. These are separate from the local demo emails.</p>
    </div>
    {account?.id === "sample"
      ? <section className="card p-6"><h2 className="font-medium">Google account required</h2><p className="mt-2 text-ink-2">Sign out of the demo mailbox, then continue with Google to sync Gmail.</p></section>
      : <GmailInbox onExpired={() => void signOut()} />}
  </div>;
}
