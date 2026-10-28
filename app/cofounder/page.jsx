import { redirect } from "next/navigation";

// The app now lives at the home page; keep old links working.
export default function Page() {
  redirect("/");
}
