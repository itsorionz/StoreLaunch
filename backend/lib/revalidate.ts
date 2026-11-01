import { updateTag } from "next/cache";

export function revalidateStore() {
  updateTag("products");
  updateTag("settings");
  updateTag("categories");
  updateTag("brands");
  updateTag("campaigns");
  updateTag("carousel");
}
