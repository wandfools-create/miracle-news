import NewsWirePageView from "@/components/news-wire/NewsWirePageView";
import {
  fetchNewsWireDayPage,
  todayNyDateKey,
} from "@/lib/news-wire/fetchNewsWire";

export const revalidate = 60;

type PageProps = {
  searchParams: Promise<{ date?: string; page?: string }>;
};

export default async function EnglishNewsWirePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const dateKey =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayNyDateKey();
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const result = await fetchNewsWireDayPage({
    locale: "en",
    dateKey,
    page,
  });

  return (
    <NewsWirePageView
      locale="en"
      title="News Wire"
      homeHref="/en"
      homeLabel="Hannoon home"
      items={result.items}
      dateKey={result.dateKey}
      page={result.page}
      hasMore={result.hasMore}
      schemaReady={result.schemaReady}
      error={result.error}
    />
  );
}
