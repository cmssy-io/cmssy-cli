type {{Pascal}}Content = {
  heading?: string;
};

export default function {{Pascal}}({ content }: { content: {{Pascal}}Content }) {
  const { heading } = content;
  if (!heading) return null;
  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <h2 className="text-2xl font-bold">{heading}</h2>
    </section>
  );
}
