export interface Migration {
  /** Monotonic. The applied value is stored in meta.schema_version. */
  version: number;
  name: string;
  /** Applied in order, inside one transaction per migration. */
  statements: string[];
}
