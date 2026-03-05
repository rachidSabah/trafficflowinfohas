// v36.0 Enterprise - GA4 Attribution Fix + SERP Simulation
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrafficFlow v36.0 Enterprise - SEO Traffic Management",
  description: "TrafficFlow v36.0 Enterprise - GA4 Attribution Fix, realistic device distribution (45% mobile), and debug logging. Enterprise-grade traffic management with Behavior Pattern Simulation for organic traffic patterns.",
  keywords: ["TrafficFlow", "Traffic Management", "Analytics", "GA4", "Campaigns", "SaaS", "SEO", "Marketing", "User Agent Rotation", "Browser Fingerprint", "Anti-Detection", "Organic Traffic", "Behavior Simulation", "Scroll Depth", "Click Simulation", "Bounce Rate", "Pages Per Session", "Return Visitors"],
  authors: [{ name: "TrafficFlow Team" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "TrafficFlow v36.0 Enterprise",
    description: "TrafficFlow v36.0 Enterprise - GA4 Attribution Fix, realistic device distribution, and debug logging for organic traffic patterns",
    url: "https://trafficflow.io",
    siteName: "TrafficFlow",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrafficFlow v36.0 Enterprise",
    description: "TrafficFlow v36.0 Enterprise - GA4 Attribution Fix and realistic device distribution for organic traffic patterns",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
