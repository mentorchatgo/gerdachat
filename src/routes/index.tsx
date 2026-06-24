import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import App from "../whatsapp/App";
import "../whatsapp/whatsapp.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WhatsApp — Gerda" },
      { name: "description", content: "Chat met Gerda via Lovable AI." },
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
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return <App />;
}
