/**
 * Minimal in-memory stand-in for the subset of the supabase-js query builder
 * used by the chat route. Scoped to one user, like Row Level Security.
 */

type Row = Record<string, unknown>;

/** Column defaults declared in the SQL migration. */
const DEFAULTS: Record<string, Row> = {
  messages: { status: "complete" },
  conversations: { summary: "", archived: false },
};

let idSeq = 0;
const newId = () => `00000000-0000-4000-8000-${(++idSeq).toString().padStart(12, "0")}`;

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number }> {
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max = Infinity;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private singleMode: "one" | "maybe" | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select() {
    return this;
  }
  insert(row: Row | Row[]) {
    this.mode = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  upsert(row: Row) {
    return this.insert(row);
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  gte(col: string, val: string) {
    this.filters.push((r) => Date.parse(String(r[col])) >= Date.parse(val));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }

  private run() {
    if (this.db.failTables.has(this.table)) return { data: null, error: { message: "boom" } };
    const rows = (this.db.tables[this.table] ??= []);
    if (this.mode === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const inserted = list.map((r) => ({
        ...(DEFAULTS[this.table] ?? {}),
        id: newId(),
        created_at: new Date(Date.now() + idSeq).toISOString(),
        updated_at: new Date().toISOString(),
        ...r,
      }));
      rows.push(...inserted);
      return this.shape(inserted);
    }
    let matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === "update") {
      matched.forEach((r) => Object.assign(r, this.payload, { updated_at: new Date().toISOString() }));
      return this.shape(matched);
    }
    if (this.mode === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !matched.includes(r));
      return this.shape(matched);
    }
    for (const o of [...this.orders].reverse()) {
      matched = [...matched].sort((a, b) => {
        const x = a[o.col] as string | number;
        const y = b[o.col] as string | number;
        return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
      });
    }
    return this.shape(matched.slice(0, this.max));
  }

  private shape(rows: Row[]) {
    if (this.singleMode) {
      if (rows.length === 0 && this.singleMode === "one") return { data: null, error: { message: "no rows" } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  then<A, B>(
    ok?: ((v: { data: unknown; error: { message: string } | null }) => A | PromiseLike<A>) | null,
    ko?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, ko);
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  failTables = new Set<string>();

  client() {
    return {
      from: (table: string) => new Query(this, table),
    };
  }
}
