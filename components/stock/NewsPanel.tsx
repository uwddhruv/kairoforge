'use client';

import useSWR from 'swr';
import axios from 'axios';
import { Newspaper, ExternalLink, Loader2 } from 'lucide-react';

interface Article {
  title: string;
  description?: string;
  url: string;
  publishedAt: string;
  source?: { name: string };
}

interface Props {
  symbol: string;
  companyName: string;
}

const fetcher = (url: string) => axios.get(url).then(r => r.data);

export function NewsPanel({ symbol, companyName }: Props) {
  const { data, isLoading } = useSWR(`/api/news/${symbol}`, fetcher, {
    revalidateOnFocus: false,
  });

  const articles: Article[] = data?.articles ?? [];

  return (
    <div className="kf-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="w-4 h-4 text-[#7B5EDB]" />
        <h3 className="text-sm font-semibold text-white">Latest News — {companyName}</h3>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-[#6b6b80] text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin text-[#7B5EDB]" />
          Loading news...
        </div>
      )}

      {!isLoading && articles.length === 0 && (
        <p className="text-[#6b6b80] text-sm py-2">
          No recent news available. Configure GNEWS_API_KEY for live headlines.
        </p>
      )}

      {!isLoading && articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article, i) => (
            <a
              key={i}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.03] transition-all group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#e0e0f0] font-medium group-hover:text-[#a78bfa] transition-colors line-clamp-2 mb-1">
                  {article.title}
                </div>
                {article.description && (
                  <div className="text-xs text-[#6b6b80] line-clamp-2">{article.description}</div>
                )}
                <div className="text-xs text-[#6b6b80]/60 mt-1">
                  {article.source?.name} · {new Date(article.publishedAt).toLocaleDateString('en-IN')}
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-[#6b6b80] group-hover:text-[#7B5EDB] shrink-0 mt-0.5 transition-colors" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
