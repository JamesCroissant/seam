// A page with no loader and no islands: plain HTML, zero React in the browser.
export default function About() {
  return (
    <>
      <title>About</title>
      <h1>About</h1>
      <p>Pages are HTML. Only islands (files with &quot;use client&quot;) send JavaScript.</p>
    </>
  );
}
