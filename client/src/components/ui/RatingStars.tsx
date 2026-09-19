import React from 'react';

export function RatingStars({
  rating,
  reviews,
  size = 'sm',
}: {
  rating: number | null | undefined;
  reviews?: number | null;
  size?: 'xs' | 'sm' | 'md';
}) {
  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) {
    return <span className="text-xs text-slate-400 font-medium">No reviews</span>;
  }

  const numRating = Number(rating);
  const starSize = size === 'xs' ? 'h-3 w-3' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className="inline-flex items-center gap-1.5" title={numRating.toFixed(1) + ' stars' + (reviews ? ' (' + reviews + ' reviews)' : '')}>
      <div className="flex items-center text-amber-400">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={[starSize, star <= Math.round(numRating) ? 'fill-amber-400 text-amber-400' : 'fill-slate-100 text-slate-200'].join(' ')}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ))}
      </div>
      <span className="text-xs font-bold text-slate-700 tabular-nums">
        {numRating.toFixed(1)}
      </span>
      {reviews !== undefined && reviews !== null && (
        <span className="text-[11px] text-slate-400 tabular-nums">
          ({reviews.toLocaleString()})
        </span>
      )}
    </div>
  );
}
