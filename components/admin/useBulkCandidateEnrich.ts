"use client";

import { useCallback, useState } from "react";

import { enrichSingleCandidateAction } from "@/app/admin/(app)/collection-candidates/enrichSingleCandidateAction";
import {
  failedEnrichCandidateIds,
  runSequentialCandidateEnrich,
  summarizeBulkCandidateEnrich,
  type BulkCandidateEnrichSummary,
} from "@/lib/collection-candidates/candidateEnrichBulk";

export type BulkEnrichProgress = {
  current: number;
  total: number;
  candidateTitle: string;
};

type Options = {
  titlesById: ReadonlyMap<string, string>;
  onEnrichedIds: (ids: string[]) => void;
  onFailedIds: (ids: string[]) => void;
};

export function useBulkCandidateEnrich({ titlesById, onEnrichedIds, onFailedIds }: Options) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BulkEnrichProgress | null>(null);
  const [summary, setSummary] = useState<BulkCandidateEnrichSummary | null>(null);

  const runBulkEnrich = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0 || running) return;

      setRunning(true);
      setSummary(null);
      setProgress({ current: 0, total: ids.length, candidateTitle: "" });

      const results = await runSequentialCandidateEnrich(
        ids,
        titlesById,
        enrichSingleCandidateAction,
        ({ index, total, candidateTitle }) => {
          setProgress({ current: index, total, candidateTitle });
        }
      );

      const nextSummary = summarizeBulkCandidateEnrich(results);
      setSummary(nextSummary);
      setProgress(null);
      setRunning(false);

      const enrichedIds = results
        .filter(
          (r) =>
            r.ok &&
            (r.outcome === "success" || r.outcome === "already_enriched")
        )
        .map((r) => r.candidateId);
      onEnrichedIds(enrichedIds);
      onFailedIds(failedEnrichCandidateIds(nextSummary));
    },
    [running, titlesById, onEnrichedIds, onFailedIds]
  );

  const dismissSummary = useCallback(() => {
    setSummary(null);
  }, []);

  return {
    running,
    progress,
    summary,
    runBulkEnrich,
    dismissSummary,
  };
}
