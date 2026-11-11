import Image from "next/image";
import { listActiveCampaigns, listCarouselSlides } from "@backend/lib/admin-catalog-queries";
import { DeleteSlideButton } from "@frontend/components/admin/delete-buttons";
import { AddSlideModal, EditSlideModal } from "@frontend/components/admin/carousel-form";
import { PageHeader } from "@frontend/components/admin/admin-ui";

export const metadata = { title: "Carousel — Admin" };

export default async function AdminCarouselPage() {
  const [slides, campaigns] = await Promise.all([listCarouselSlides(), listActiveCampaigns()]);
  const activeCount = slides.filter((slide) => slide.active).length;
  // No slides => the homepage hero falls back to showing active campaigns.
  const activeCampaigns = slides.length === 0 ? campaigns.length : 0;

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
              {activeCampaigns > 0 ? (
                <>
                  No slides yet. The homepage hero is currently showing{" "}
                  <span className="font-semibold text-foreground">
                    {activeCampaigns} active campaign{activeCampaigns === 1 ? "" : "s"}
                  </span>{" "}
                  instead (fallback). Add an image to take over the carousel — images are resized
                  automatically to the slider size.
                </>
              ) : (
                <>
                  No slides yet. Add an image to show it in the homepage carousel. Images are
                  resized automatically to the slider size.
                </>
              )}
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
