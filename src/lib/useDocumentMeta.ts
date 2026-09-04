import { useEffect } from "react";

type DocumentMeta = {
  title: string;
  description: string;
  robots?: string | undefined;
};

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

// Replaces TanStack Start's per-route `head()` blocks. There is no SSR any more,
// so titles and meta tags are applied on the client when a route mounts.
export function useDocumentMeta({ title, description, robots }: DocumentMeta) {
  useEffect(() => {
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "robots", robots ?? "index, follow");
  }, [title, description, robots]);
}
