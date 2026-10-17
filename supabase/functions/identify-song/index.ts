// identify-song — HQ "Identify song" (2026-10-17)
// Receives a short audio clip (multipart field "file") from the browser, asks AudD
// what song it is, and returns a trimmed result. The AudD token lives in the
// function's secrets (AUDD_TOKEN), never in the client.
// Deploy:  supabase secrets set AUDD_TOKEN=...   then
//          supabase functions deploy identify-song --project-ref ffleqouktwanayuidyaf
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const token = Deno.env.get("AUDD_TOKEN");
  if (!token) return json({ error: "AUDD_TOKEN secret is not set" }, 500);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch (_) { /* fall through */ }
  if (!file || file.size < 1000) return json({ error: "No audio received" }, 400);

  const out = new FormData();
  out.append("api_token", token);
  out.append("return", "spotify,apple_music");
  out.append("file", file, file.name || "clip.webm");
  const res = await fetch("https://api.audd.io/", { method: "POST", body: out });
  const data = await res.json().catch(() => null);
  if (!data) return json({ error: "AudD returned an unreadable response" }, 502);
  if (data.status !== "success") return json({ error: data.error?.error_message || "AudD error" }, 502);
  const r = data.result;
  if (!r) return json({ match: null });

  const cover =
    r.spotify?.album?.images?.[0]?.url ||
    (r.apple_music?.artwork?.url ? String(r.apple_music.artwork.url).replace("{w}", "300").replace("{h}", "300") : null);
  return json({
    match: {
      title: r.title || "",
      artist: r.artist || "",
      album: r.album || "",
      release_date: r.release_date || null,
      song_link: r.song_link || null,
      spotify_url: r.spotify?.external_urls?.spotify || null,
      apple_url: r.apple_music?.url || null,
      cover_url: cover,
    },
  });
});
