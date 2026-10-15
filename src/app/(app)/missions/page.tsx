import ModuleList from "@/components/ModuleList";

export default function MissionsPage() {
  return (
    <main className="screen">
      <h1 className="h1">Missions</h1>
      <p className="lead">Le centre de contrôle des actions et automatisations de JARVIS.</p>
      <section className="panel">
        <h2 className="panel-title">Automatisations actives</h2>
        <div className="empty">
          Aucune automatisation. Ce centre de contrôle arrive en phase 3 : chaque automatisation pourra être activée,
          suspendue ou supprimée ici, avec un périmètre d&apos;autorisation précis.
        </div>
      </section>
      <section className="panel">
        <h2 className="panel-title">Règles déjà en vigueur</h2>
        <ul className="list">
          <li>Aucune action sensible sans votre confirmation explicite.</li>
          <li>JARVIS n&apos;affirme jamais avoir effectué une action qu&apos;il n&apos;a pas réalisée.</li>
          <li>Chaque action est inscrite dans le journal (Historique).</li>
          <li>Les contenus externes (emails, documents) seront traités comme des données, jamais comme des ordres.</li>
        </ul>
      </section>
      <section className="panel">
        <h2 className="panel-title">Feuille de route</h2>
        <ModuleList filter={(m) => m.phase >= 3} />
      </section>
    </main>
  );
}
