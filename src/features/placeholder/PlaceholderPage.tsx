export function PlaceholderPage({ title, hint }: { title: string; hint: string }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{hint}</p>
        </div>
      </div>
      <section className="card">
        <p className="empty">模块尚未接通。骨架已就绪：SQLite 表、错误码和统一 API 都已就位。</p>
      </section>
    </>
  );
}
