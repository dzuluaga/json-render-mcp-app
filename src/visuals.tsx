import DOMPurify from "dompurify";
import { DATA_IMAGE_URL } from "./spec-schema.js";

// Only same-document references (#id) survive; everything else that could load or run something is dropped.
DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  const value = data.attrValue.trim();
  if ((data.attrName === "href" || data.attrName === "xlink:href" || data.attrName === "src") && !value.startsWith("#")) {
    data.keepAttr = false;
  }
  if (/url\(\s*["']?\s*(?!#)/i.test(value)) data.keepAttr = false;
});

export function Svg({ svg, title, maxWidth }: { svg: string; title?: string | null; maxWidth?: number | null }) {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "image", "script", "style"],
  });
  return (
    <figure className="m-0 flex flex-col gap-1.5" style={maxWidth ? { maxWidth } : undefined}>
      <div className="[&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={title ?? undefined} dangerouslySetInnerHTML={{ __html: clean }} />
      {title && <figcaption className="text-xs text-muted-foreground">{title}</figcaption>}
    </figure>
  );
}

/** Shows embedded images only; anything that isn't a data:image URL renders as a placeholder. */
export function Image({ src, alt, maxWidth }: { src: string; alt: string; maxWidth?: number | null }) {
  if (typeof src !== "string" || !DATA_IMAGE_URL.test(src)) {
    return <p className="text-sm text-muted-foreground">[image unavailable]</p>;
  }
  return <img className="h-auto max-w-full rounded-md" src={src} alt={alt} style={maxWidth ? { maxWidth } : undefined} />;
}
