import Image from "next/image";
import { CmssyLink } from "@cmssy/next/client";
import styles from "./Hero.module.css";

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
    <section className={styles.hero}>
      <div className={styles.inner}>
        {badgeText && <span className={styles.badge}>{badgeText}</span>}

        <h1 className={styles.title}>
          {heading}
          {headingHighlight && (
            <>
              {heading ? " " : ""}
              <span className={styles.highlight}>{headingHighlight}</span>
            </>
          )}
        </h1>

        {subheading && <p className={styles.subheading}>{subheading}</p>}

        {(primaryButtonText || secondaryButtonText) && (
          <div className={styles.actions}>
            {primaryButtonText && (
              <CmssyLink
                href={primaryButtonUrl}
                className={styles.buttonPrimary}
              >
                {primaryButtonText}
              </CmssyLink>
            )}
            {secondaryButtonText && (
              <CmssyLink
                href={secondaryButtonUrl}
                className={styles.buttonSecondary}
              >
                {secondaryButtonText}
              </CmssyLink>
            )}
          </div>
        )}

        {media && (
          <div className={styles.media}>
            <div className={styles.mediaFrame}>
              {isVideo(media) ? (
                <video
                  src={media}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className={styles.video}
                />
              ) : (
                <Image
                  src={media}
                  alt={heading ?? ""}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  style={{ objectFit: "cover" }}
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
