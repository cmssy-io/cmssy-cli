import Image from "next/image";
import { CmssyLink } from "@cmssy/next/client";

type HeroContent = {
  badgeText?: string;
  heading?: string;
  headingHighlight?: string;
  subheading?: string;
  primaryButtonText?: string;
  primaryButtonUrl?: string;
  secondaryButtonText?: string;
  secondaryButtonUrl?: string;
  media?: string;
};

const isVideo = (src: string) => /\.(mp4|webm|ogg)$/i.test(src);

export default function Hero({ content }: { content: HeroContent }) {
  const {
    badgeText,
    heading,
    headingHighlight,
    subheading,
    primaryButtonText,
    primaryButtonUrl = "#",
    secondaryButtonText,
    secondaryButtonUrl = "#",
    media,
  } = content;

  if (!heading && !headingHighlight) return null;

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-linear-to-br from-muted via-background to-muted" />
      <div className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-32">
        {badgeText && (
          <span className="mb-6 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            {badgeText}
          </span>
        )}

        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          {heading}
          {headingHighlight && (
            <>
              {heading ? " " : ""}
              <span className="bg-linear-to-r from-primary to-foreground bg-clip-text text-transparent">
                {headingHighlight}
              </span>
            </>
          )}
        </h1>

        {subheading && (
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            {subheading}
          </p>
        )}

        {(primaryButtonText || secondaryButtonText) && (
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            {primaryButtonText && (
              <CmssyLink
                href={primaryButtonUrl}
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {primaryButtonText}
              </CmssyLink>
            )}
            {secondaryButtonText && (
              <CmssyLink
                href={secondaryButtonUrl}
                className="inline-flex h-12 items-center justify-center rounded-md border border-border px-8 text-base font-medium transition-colors hover:bg-muted"
              >
                {secondaryButtonText}
              </CmssyLink>
            )}
          </div>
        )}

        {media && (
          <div className="mt-16 overflow-hidden rounded-xl border border-border shadow-2xl">
            <div className="relative aspect-video">
              {isVideo(media) ? (
                <video
                  src={media}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <Image
                  src={media}
                  alt={heading ?? ""}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                  priority
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
