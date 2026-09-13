import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import type { NewsWireItem } from "@/lib/news-wire/types";

function formatWireTime(iso: string | null, locale: ArticleLocale): string {
  if (!iso) return locale === "ko" ? "시각 미상" : "Time unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return locale === "ko" ? "시각 미상" : "Time unknown";
  }
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function NewsWireRail({
  items,
  locale,
  title,
  moreLabel,
  moreHref,
}: {
  items: NewsWireItem[];
  locale: ArticleLocale;
  title: string;
  moreLabel: string;
  moreHref: string;
}) {
  if (items.length === 0) return null;

  return (
    <section
      id="news-wire"
      className="mt-4 min-w-0 scroll-mt-6 border-t border-neutral-300 pt-3"
      aria-labelledby="news-wire-heading"
    >
      <h2
        id="news-wire-heading"
        className="border-b border-neutral-200 pb-2 text-[15px] font-bold text-news-navy"
      >
        {title}
      </h2>
      <ul className="mt-1 divide-y divide-neutral-100">
        {items.map((item) => (
          <li key={item.id} className="py-2">
            <a
              href={item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0 text-[13px] font-semibold leading-snug text-neutral-900 hover:underline"
            >
              <span className="line-clamp-2">{item.title}</span>
            </a>
            <p className="mt-1 truncate text-[11px] text-neutral-500">
              {item.sourceLabel}
              <span className="mx-1 text-neutral-300">·</span>
              {formatWireTime(item.publishedAt || item.collectedAt, locale)}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2">
        <a
          href={moreHref}
          className="text-[12px] font-semibold text-news-navy hover:underline"
        >
          {moreLabel}
        </a>
      </p>
    </section>
  );
}
