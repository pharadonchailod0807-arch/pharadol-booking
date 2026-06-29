import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const missingSupabaseConfigError = new Error(
  "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
);

const createMissingQuery = () => {
  const query = {
    select: () => query,
    insert: () => query,
    update: () => query,
    upsert: () => query,
    delete: () => query,
    eq: () => query,
    in: () => query,
    neq: () => query,
    order: () => query,
    single: () => query,
    maybeSingle: () => query,
    then: (resolve) =>
      Promise.resolve({ data: null, error: missingSupabaseConfigError }).then(
        resolve
      ),
  };

  return query;
};

const createMissingChannel = () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };

  return channel;
};

const createMissingSupabaseClient = () => ({
  from: () => createMissingQuery(),
  channel: () => createMissingChannel(),
  removeChannel: () => Promise.resolve({ error: missingSupabaseConfigError }),
});

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createMissingSupabaseClient();
