"use client";

import { publicImageUrl } from "@/lib/files";

/** An image the API serves by its public id (fliers, course fliers). */
export default function StoredImage({ id, alt, className }: { id?: string | null; alt: string; className?: string }) {
  const url = publicImageUrl(id);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}
