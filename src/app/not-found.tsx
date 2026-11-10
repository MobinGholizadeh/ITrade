import Link from "next/link";
export default function NotFound() {
  return (
    <section className="panel future-panel">
      <span className="eyebrow">404</span>
      <h1>This page is not in your workspace.</h1>
      <Link href="/" className="button primary">
        Return to overview
      </Link>
    </section>
  );
}
