import HomeNewsView from "@/components/home/HomeNewsView";
import { fetchEditionHomeArticles } from "@/lib/home/fetchEditionHomeArticles";
import { enHomeLabels } from "@/lib/home/enHomeLabels";
import { prepareEditionHomeSections } from "@/lib/home/prepareEditionHomeSections";
import { enHomeSearchLabels } from "@/lib/home/enSearchLabels";
import { formatServerHeaderDate } from "@/lib/home/serverDateLabels";

export const dynamic = "force-dynamic";

export default async function EnglishHomePage() {
  const { articles, error } = await fetchEditionHomeArticles("en");
  const headerDateText = formatServerHeaderDate("en");

  const sections = prepareEditionHomeSections(
    articles,
    "en",
    {
      leftTitle: "US & international",
      rightTitle: "Korea",
    },
    { featuredPool: articles }
  );

  /** Only outlets that currently have published articles (e.g. hide Yonhap at 0). */
  const sourceOptions = sections.activeSourceLabels;

  return (
    <HomeNewsView
      pageRole="en"
      locale="en"
      labels={enHomeLabels}
      sections={sections}
      articleHrefPrefix="/en/article"
      homeHref="/en"
      alternateLangHref="/ko"
      sourceFilterOptions={sourceOptions}
      sourceFilterAllLabel="All outlets"
      errorMessage={error?.message ?? null}
      showDateInHeader
      headerDateText={headerDateText}
      searchArticles={articles}
      searchPath="/en/search"
      searchLabels={enHomeSearchLabels}
    />
  );
}
