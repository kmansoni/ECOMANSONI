// ---------------------------------------------------------------------------
// Deno std http server — all versions used across edge functions
// ---------------------------------------------------------------------------
declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
}

declare module "https://deno.land/std@0.190.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
}

declare module "https://deno.land/std@0.208.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
}

// ---------------------------------------------------------------------------
// Supabase JS — all versions used across edge functions
// ---------------------------------------------------------------------------
declare module "https://esm.sh/@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare module "https://esm.sh/@supabase/supabase-js@2.39.0" {
  export * from "@supabase/supabase-js";
}

declare module "https://esm.sh/@supabase/supabase-js@2.49.1" {
  export * from "@supabase/supabase-js";
}

declare module "https://esm.sh/@supabase/supabase-js@2.90.1" {
  export * from "@supabase/supabase-js";
}

// ---------------------------------------------------------------------------
// Deno global — env + serve (Deno.serve is available in Deno >= 1.35)
// ---------------------------------------------------------------------------
declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: { port?: number; hostname?: string },
  ): void;
};
