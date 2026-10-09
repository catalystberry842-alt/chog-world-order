import type { Metadata, Viewport } from "next";
import { Caveat, Fredoka, Inter } from "next/font/google";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { CrayonDefs } from "@/components/ui/crayon-defs";
import { Providers } from "@/components/wallet/providers";
import { site } from "@/lib/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
  weight: ["500", "600", "700"],
});

const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat", weight: ["500", "700"] });

export const metadata: Metadata = {
  title: {
    default: `${site.name} · Monad contribution passport`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
};

export const viewport: Viewport = {
  themeColor: "#0a0614",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fredoka.variable} ${caveat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <CrayonDefs />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-night-950"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
