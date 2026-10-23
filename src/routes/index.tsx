import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import "../whatsapp/whatsapp.css";

const App = lazy(() => import("../whatsapp/App"));

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "WhatsApp — Gerda" },
      { name: "description", content: "Chat met Gerda via Lovable AI." },
      { property: "og:title", content: "WhatsApp — Gerda" },
      { property: "og:description", content: "Chat met Gerda, stuur foto's en deel spraakberichten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "preload",
        as: "fetch",
        href: "https://i.imgur.com/eCBZgoo.mp4",
        crossOrigin: "anonymous",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
