import type { Database as SupabaseDb } from "../../database.types";
import { column, type ColumnsType } from "@powersync/react-native";

type SupaTables = SupabaseDb["public"]["Tables"];
export type SupaTableName = keyof SupaTables & string;
export type SupaRow<T extends SupaTableName> = SupaTables[T]["Row"];

// Column value type (whatever column.text / column.integer returns)
type Col = ColumnsType[string];

// map TS field types -> column types you expect locally
type ColFor<V> =
  // unwrap null
  null extends V
    ? ColFor<Exclude<V, null>>
    : V extends string
    ? typeof column.text
    : V extends number
    ? typeof column.integer
    : V extends boolean
    ? typeof column.integer // common: store booleans as 0/1
    : // fallback (Json, etc)
      typeof column.text;

// build the expected column map for a given Supabase table
export type PowerSyncColsFor<T extends SupaTableName> = {
  [K in Exclude<keyof SupaRow<T>, "id"> & string]: ColFor<SupaRow<T>[K]>;
};

// Exact type equality helper
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
    ? true
    : false
  : false;
