// Minimal Deno globals so `npm run typecheck:functions` can check these files with tsc.
// The real types come from the Deno runtime that Supabase runs them on.
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
