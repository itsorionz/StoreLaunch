import Image from "next/image";
import { db } from "@backend/lib/db";
import { DeleteSlideButton } from "@frontend/components/admin/delete-buttons";
import { AddSlideModal, EditSlideModal } from "@frontend/components/admin/carousel-form";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Carousel — Admin" };

export default async function AdminCarouselPage() {
  const [slides, campaigns] = await Promise.all([
    db.carouselSlide.findMany({ orderBy: [{ order: "asc" }, { createdAt: "desc" }] }),
    db.campaign.findMany({
      where: { active: true },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);
  const activeCount = slides.filter((slide) => slide.active).length;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Homepage carousel"
        subtitle={`${slides.length} slides — ${activeCount} active. Active slides rotate in random order on the homepage.`}
        action={<AddSlideModal campaigns={campaigns} />}
      />
      <section className="card overflow-hidden">
        <ul className="divide-y divide-border">
          {slides.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted">
              No slides yet. Add an image to show it in the homepage carousel. Images are resized
              automatically to the slider size.
            </li>
          )}
          {slides.map((slide) => (
            <li key={slide.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <div className="relative aspect-[16/5] w-44 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
                <Image
                  src={slide.imageUrl}
                  alt={slide.title ?? "Carousel slide"}
                  fill
                  unoptimized
                  sizes="176px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{slide.title || "Untitled slide"}</p>
                <p className="truncate text-xs text-muted">
                  {slide.linkUrl ? `Opens ${slide.linkUrl}` : "No link"} · Order {slide.order} ·{" "}
                  {slide.active ? (
                    <span className="text-primary">Active</span>
                  ) : (
                    <span className="text-muted">Inactive</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <EditSlideModal slide={slide} campaigns={campaigns} />
                <DeleteSlideButton id={slide.id} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
