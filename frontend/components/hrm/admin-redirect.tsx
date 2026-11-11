"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function HrmAdminRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname.startsWith("/hrm")) {
      const adminPath = "/admin/hrm" + pathname.slice(4); // /hrm/employees -> /admin/hrm/employees
      router.replace(adminPath, { scroll: false });
    }
  }, [pathname, router]);
  return null;
}
