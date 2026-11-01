import { deliveryMapLinks } from "@backend/lib/delivery-maps";

export function DeliveryMap({ address, compact = false }: { address: string; compact?: boolean }) {
  const links = deliveryMapLinks(address);
  const key = process.env.GOOGLE_MAPS_EMBED_KEY;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href={links.map} target="_blank" rel="noopener noreferrer" className="btn-outline">
          Open map
        </a>
        <a
          href={links.directions}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          Get directions
        </a>
      </div>
      {!compact && (
        <>
          <p className="text-xs text-muted">
            Check the map result against the written address. Call the customer if the pin or
            entrance is unclear.
          </p>
          {key && (
            <iframe
              title={`Delivery map: ${address}`}
              className="h-80 w-full rounded-xl border border-border"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              src={`https://www.google.com/maps/embed/v1/place?${new URLSearchParams({ key, q: `${address}, Bangladesh` })}`}
            />
          )}
        </>
      )}
    </section>
  );
}
