import { Suspense } from "react";
import { getDict } from "@frontend/i18n/dict";

export const metadata = { title: "Blog" };

async function BlogContent() {
  const dict = await getDict();

  return (
    <div className="w-full  space-y-5 py-8">
      <h1 className="text-3xl font-bold">{dict.info.blog.title}</h1>
      <div className="space-y-3">
        {dict.info.blog.posts.map((post) => (
          <article key={post.title} className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {post.date}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold">{post.title}</h2>
            <p className="mt-1.5 text-sm text-muted">{post.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function BlogPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 w-full rounded-2xl" />}>
      <BlogContent />
    </Suspense>
  );
}
