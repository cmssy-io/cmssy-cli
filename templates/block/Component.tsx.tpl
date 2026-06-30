import styles from "./{{Pascal}}.module.css";

type {{Pascal}}Content = {
  heading?: string;
};

export default function {{Pascal}}({ content }: { content: {{Pascal}}Content }) {
  const { heading } = content;
  if (!heading) return null;
  return (
    <section className={styles.block}>
      <h2 className={styles.heading}>{heading}</h2>
    </section>
  );
}
