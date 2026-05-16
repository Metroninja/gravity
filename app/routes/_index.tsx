import { redirect } from "react-router";

import { getUserId } from "~/lib/auth.server";
import type { Route } from "./+types/_index";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  return redirect(userId ? "/courses" : "/login");
}

export default function Index() {
  return null;
}
