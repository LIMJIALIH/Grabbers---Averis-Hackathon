import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Lato } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/app-state";
import { Shell } from "@/components/shell/Shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jb" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato" });

export const metadata: Metadata = {
  title: "DocuVerify | Shipping documentation",
  description: "Classifies a shipping inbox, checks every draft BL against its SI, and escalates the uncertain ones to a human.",
  icons: { icon: "/icon.svg" },
};

// Blocking, pre-hydration: the only fix for the flash of light theme (§0.4).
const themeScript = `try{var t=localStorage.getItem("docuverify-theme");if(t!=="dark")t="light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${lato.variable}`} suppressHydrationWarning>
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
