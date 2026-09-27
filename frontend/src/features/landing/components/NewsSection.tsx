import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Newspaper, RefreshCw } from "lucide-react";

import { apiGet } from "@/lib/http";
import { formatRelative } from "@/shared/utils/time";

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
}

const NEWS_QUERY_KEY = ["landing-news"];

/**
 * Fetches live IT sector news from the NewsAPI endpoint.
 * Falls back to a graceful "unavailable" state if the API key is missing
 * or the request fails.
 */
export function NewsSection() {
  const {
    data: articles = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<NewsArticle[]>({
    queryKey: NEWS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiGet<{ articles: NewsArticle[] }>(
        "/news/tech?country=us&page_size=6",
      );
      return res.articles ?? [];
    },
    staleTime: 5 * 60_000, // 5 minutes
    retry: 1,
  });

  if (isError) {
    return (
      <section className="pb-16 px-6">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Newspaper size={15} className="text-cyan" strokeWidth={2} />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Latest in IT
            </span>
          </div>
          <div className="glass rounded-2xl p-8 text-center text-muted text-[13px]">
            Live news is currently unavailable. Check back later.
          </div>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="pb-16 px-6">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Newspaper size={15} className="text-cyan" strokeWidth={2} />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Latest in IT
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="shimmer rounded-2xl h-[180px]"
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-20 px-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Newspaper size={15} className="text-cyan" strokeWidth={2} />
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Latest in IT
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="ml-auto text-muted hover:text-txt cursor-pointer focusable p-1"
            title="Refresh news"
          >
            <RefreshCw
              size={12}
              strokeWidth={2}
              className={isFetching ? "animate-spin" : ""}
            />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass glass-hover rounded-2xl p-4 flex flex-col cursor-pointer focusable transition-colors"
            >
              <div className="text-[13px] font-medium leading-snug mb-2 line-clamp-2">
                {a.title}
              </div>
              {a.description && (
                <div className="text-[12px] text-muted leading-relaxed line-clamp-3 mb-3">
                  {a.description}
                </div>
              )}
              <div className="flex items-center gap-2 mt-auto pt-2 font-mono text-[10.5px] text-muted/70">
                <span>{a.source}</span>
                <span>·</span>
                <span>{formatRelative(a.publishedAt)}</span>
                <ExternalLink
                  size={10}
                  strokeWidth={2}
                  className="ml-auto flex-none"
                />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}