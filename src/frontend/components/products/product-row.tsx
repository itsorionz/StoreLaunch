import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@frontend/components/ui/toast";

type ProductRowProps = {
  title: string;
  href?: string;
  products: any[];
  currencySymbol: string;
  deliveryEstimate: string;
  onSale?: boolean;
};

export const ProductRow = ({
  title,
  href,
  products,
  currencySymbol,
  deliveryEstimate,
  onSale,
}: ProductRowProps) => {
  const router = useRouter();
  const toast = useToast();

  // Handle link click for deals/filters
  const handleHrefClick = (e: React.MouseEvent) => {
    if (href) {
      e.preventDefault();
      const hrefParams = new URLSearchParams(href.split("?")[1]);
      const hasOnSale = hrefParams.get("onSale") === "1";
      const hasFlashSale = hrefParams.get("flashSale") === "1";

      // Show confirmation for filtering by sale status
      if (hasOnSale || hasFlashSale) {
        const confirmed = window.confirm(
          `Filter by ${hasOnSale ? "On Sale" : "Flash Sale"} items?`
        );
        if (!confirmed) return;
      }

      router.push(href);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start gap-2">
      <div className="w-full sm:w-24">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h3>
      </div>

      <div className="flex-1">
        {/* Deal filter links if href contains sale filter */}
        {href && href.includes("onSale") && (
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push(href.replace(/onSale=1/, "onSale=0"))}
              className="px-2 py-1 text-xs text-primary hover:bg-primary/5 rounded"
            >
              Hide deals
            </button>
            <button
              type="button"
              onClick={() => router.push(href.replace(/onSale=0/, "onSale=1"))}
              className="px-2 py-1 text-xs text-primary bg-primary-light rounded"
            >
              Show deals
            </button>
          </div>
        )}

        {/* Product grid */}
        {products.length === 0 && (
          <div className="p-4 text-center text-muted">
            No products found.
          </div>
        )}

        {products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="group rounded-lg border border-border p-3 hover:border-primary transition-colors"
              >
                <img
                  src={product.imageUrl || "/placeholder-product.webp"}
                  alt={product.name}
                  className="h-24 w-full object-cover rounded-t-lg"
                />
                <div className="p-2">
                  <p className="truncate line-clamp-2 text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-muted">
                    ${product.priceCents / 100}{" "}
                    {product.salePriceCents && product.salePriceCents < product.priceCents && (
                      <span className="line-through text-xs text-muted/70">
                        ${product.salePriceCents / 100}
                      </span>
                    )}
                    ${product.salePriceCents && product.salePriceCents < product.priceCents && (
                      ` ${product.priceCents / 100}`
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};