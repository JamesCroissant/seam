import { data } from "seam";

// A public page: CDNs may cache it for a minute.
export function loader() {
  return data(null, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } });
}

export default function About() {
  return (
    <>
      <title>About · Seam</title>
      <h1>About</h1>
      <p>Pages are plain HTML. Only islands (files with &apos;use client&apos;) send JavaScript.</p>
      <p>
        <a href="/nope">A broken link</a>
      </p>
    </>
  );
}
