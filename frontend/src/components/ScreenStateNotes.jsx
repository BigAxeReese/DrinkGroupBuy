export function ScreenStateNotes({ loading, empty, error }) {
  return (
    <section className="state-notes" aria-label="?恍??內??>
      <h3>?恍??內??/h3>
      <div className="state-grid">
        <p><strong>Loading</strong>{loading}</p>
        <p><strong>Empty</strong>{empty}</p>
        <p><strong>Error</strong>{error}</p>
      </div>
    </section>
  );
}
