export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <section className="surface mt-5 p-6">
        <p className="text-sm text-muted-foreground">This screen is not built yet.</p>
      </section>
    </div>
  );
}
