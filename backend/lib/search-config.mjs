export const SearchLimits = Object.freeze({ queryLength: 200, resultCount: 8 });
export const SearchContexts = Object.freeze({
  admin: "admin",
  rider: "rider",
  orders: "orders",
  support: "support",
});
export const SearchRoutes = Object.freeze({
  products: "/products",
  admin: "/admin/search",
  rider: "/rider/search",
  orders: "/account/orders",
  support: "/support/search",
});
export const SearchKinds = Object.freeze({
  products: "products",
  orders: "orders",
  customers: "customers",
  riders: "riders",
  brands: "brands",
  categories: "categories",
  tickets: "tickets",
  conversations: "conversations",
});
