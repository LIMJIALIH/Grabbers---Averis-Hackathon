import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Inter, JetBrains_Mono, Lato } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/app-state";
import { Shell } from "@/components/shell/Shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jb" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato" });
// /v2 only (harbour signage faces); not preloaded so v1 pages never fetch them.
const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", preload: false });
const barlowC = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow-c", preload: false });

export const metadata: Metadata = {
  title: "DocuVerify | Shipping documentation",
  description: "Classifies a shipping inbox, checks every draft BL against its SI, and escalates the uncertain ones to a human.",
  icons: { icon: "/logo-mark.png" },
};

// Blocking, pre-hydration: the only fix for the flash of light theme (§0.4).
const themeScript = `try{var t=localStorage.getItem("docuverify-theme");if(t!=="dark")t="light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${lato.variable} ${barlow.variable} ${barlowC.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
