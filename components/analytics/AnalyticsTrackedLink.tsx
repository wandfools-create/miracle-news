import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { trackAnalyticsEvent } from "./AnalyticsPageView";
import type { AnalyticsEventName, AnalyticsLocale } from "@/lib/analytics/types";

type Props = Omit<ComponentProps<typeof Link>, "onClick"> & {
  eventName: AnalyticsEventName;
  locale?: AnalyticsLocale;
  articleId?: string;
  sourceKey?: string;
  categoryKey?: string;
  searchQuery?: string;
  children: ReactNode;
};

export default function AnalyticsTrackedLink({
  eventName,
  locale,
  articleId,
  sourceKey,
  categoryKey,
  searchQuery,
  children,
  ...linkProps
}: Props) {
  return (
    <Link
      {...linkProps}
      onClick={() =>
        trackAnalyticsEvent({
          eventName,
          locale,
          articleId,
          sourceKey,
          categoryKey,
          searchQuery,
        })
      }
    >
      {children}
    </Link>
  );
}
