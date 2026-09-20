import { redirect } from "next/navigation";

// The two apps were merged; any link already shared still lands somewhere.
export default function Verification() {
  redirect("/");
}
