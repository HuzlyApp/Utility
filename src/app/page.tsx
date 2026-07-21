import { redirect } from "next/navigation";

// Root sends recruiters into the dashboard; the middleware redirects to /login
// when there is no valid Neon Auth session.
export default function Home() {
  redirect("/dashboard");
}
