"use client";

import { Quote, Star } from "lucide-react";

type Testimonial = {
  id: string;
  authorName: string;
  authorRole: string | null;
  authorLocation: string | null;
  rating: number;
  content: string;
};

export default function TestimonialsCarousel({
  testimonials,
}: {
  testimonials: Testimonial[];
}) {
  // Duplication pour effet marquee infini seamless
  const items = [...testimonials, ...testimonials];

  return (
    <div className="tst-marquee" aria-label="Customer testimonials">
      <div className="tst-marquee-track">
        {items.map((tst, i) => (
          <div className="testimonial-card" key={`${tst.id}-${i}`}>
            <Quote className="tst-quote" size={28} />
            <div className="tst-stars">
              {Array.from({ length: 5 }).map((_, s) => (
                <Star
                  key={s}
                  size={15}
                  fill={s < tst.rating ? "currentColor" : "none"}
                  strokeWidth={1.5}
                />
              ))}
            </div>
            <p className="tst-content">&ldquo;{tst.content}&rdquo;</p>
            <div className="tst-author">
              <div className="tst-avatar">
                {tst.authorName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="tst-name">{tst.authorName}</div>
                {tst.authorRole && (
                  <div className="tst-role">
                    {tst.authorRole}
                    {tst.authorLocation ? ` · ${tst.authorLocation}` : ""}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
