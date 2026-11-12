// GET /_v/me — different for every visitor, so it is private and never stored in a shared cache.
// The layout loads it with <Include client>, so pages that show it can still be public.
import { data, type LoaderArgs, type ViewProps } from "seam";

const COOKIE = "seam_demo_visits";

export function loader({ request }: LoaderArgs) {
  const match = /(?:^|;\s*)seam_demo_visits=(\d+)/.exec(request.headers.get("Cookie") ?? "");
  const visits = Number(match?.[1] ?? 0) + 1;
  return data(
    { visits },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Set-Cookie": `${COOKIE}=${visits}; Path=/; SameSite=Lax; Max-Age=31536000`,
      },
    },
  );
}

export default function Me({ data }: ViewProps<typeof loader>) {
  return <span data-testid="visits">You · {data.visits} views</span>;
}
