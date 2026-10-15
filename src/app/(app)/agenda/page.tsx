import ModuleList from "@/components/ModuleList";

export default function AgendaPage() {
  return (
    <main className="screen">
      <h1 className="h1">Agenda & rappels</h1>
      <p className="lead">Votre programme, vos rappels et vos priorités.</p>
      <section className="panel">
        <h2 className="panel-title">Aujourd&apos;hui</h2>
        <div className="empty">
          Google Calendar n&apos;est pas encore connecté (phase 3) et les rappels internes arrivent en phase 2. En
          attendant, demandez à JARVIS de vous aider à planifier : il rédige, mais ne programme rien.
        </div>
      </section>
      <section className="panel">
        <h2 className="panel-title">Prévu</h2>
        <ModuleList filter={(m) => /rappels|Calendar|briefings/i.test(m.name)} />
      </section>
    </main>
  );
}
