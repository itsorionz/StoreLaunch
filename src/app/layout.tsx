import { ScrollToTop } from "@frontend/components/layout/scroll-to-top";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";
import { getStoreSettings } from "@backend/lib/settings";
import { getDict } from "@frontend/i18n/dict";
import { en, type Dictionary } from "@frontend/i18n/en";
import type { Lang } from "@frontend/i18n/constants";
import { ThemeProvider } from "@frontend/components/layout/theme-provider";
import { DictProvider } from "@frontend/i18n/provider";
import { CartDrawer } from "@frontend/components/cart/cart-drawer";
import { ToastProvider } from "@frontend/components/ui/toast";
import { Suspense } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
});

const themeScript = `(function(){var t="light";try{t=localStorage.getItem("sl_theme")||"light"}catch(e){}document.documentElement.classList.toggle("dark",t==="dark")})();`;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const socialImage = settings.logoUrl
    ? settings.logoUrl.startsWith("http")
      ? settings.logoUrl
      : `${baseUrl}${settings.logoUrl}`
    : undefined;
  return {
    title: {
      default: settings.storeName,
      template: `%s · ${settings.storeName}`,
    },
    description: `Shop online at ${settings.storeName}`,
    ...(settings.logoUrl ? { icons: { icon: settings.logoUrl } } : {}),
    ...(socialImage
      ? {
          openGraph: {
            images: [{ url: socialImage, width: 512, height: 512, alt: settings.storeName }],
          },
          twitter: { card: "summary", images: [socialImage] },
        }
      : {}),
  };
}

async function DictBridge({ children }: { children: React.ReactNode }) {
  const dict = await getDict();
  return (
    <DictProvider dict={dict} lang={dict.lang}>
      {children}
      <CartDrawer />
      <ScrollToTop />
    </DictProvider>
  );
}

function DictFallback({ children }: { children: React.ReactNode }) {
  return (
    <DictProvider dict={en as Dictionary} lang={"en" as Lang}>
      {children}
      <CartDrawer />
      <ScrollToTop />
    </DictProvider>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getStoreSettings();

  return (
    <html
      lang={settings.language === "bn" ? "bn" : "en"}
      className={`${geistSans.variable} ${geistMono.variable} ${bengali.variable} h-full antialiased`}
      style={{ ["--primary-brand" as string]: settings.primaryColor }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ToastProvider>
          <ThemeProvider>
            <Suspense fallback={<DictFallback>{children}</DictFallback>}>
              <DictBridge>{children}</DictBridge>
            </Suspense>
          </ThemeProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
