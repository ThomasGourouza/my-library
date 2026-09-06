import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { MainNav } from "@/components/main-nav";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ma Bibliothèque",
    template: "%s · Ma Bibliothèque",
  },
  description:
    "Bibliothèque personnelle : livres, auteurs et analyses générées par Claude.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Lien d'évitement : au clavier, la première tabulation permet de
              sauter l'en-tête. Invisible tant qu'il n'a pas le focus. */}
          <a
            href="#contenu"
            className="sr-only rounded-md bg-background px-4 py-2 text-sm font-medium ring-2 ring-ring focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
          >
            Aller au contenu
          </a>
          <MainNav />
          {/* La hauteur de l'en-tête (h-14) et le padding vertical de <main>
              (py-6) sont repris par --app-content-h dans globals.css : les
              modifier ici impose de mettre cette variable à jour. */}
          <main
            id="contenu"
            className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6"
          >
            {children}
          </main>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
