// youtube-search — finds YouTube videos for a discovered song (2026-10-17)
// GET/POST { q } → up to 5 videos. The key lives in secrets (YOUTUBE_KEY).
// Deploy:  supabase secrets set YOUTUBE_KEY=...   then
//          supabase functions deploy youtube-search --project-ref ffleqouktwanayuidyaf
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("YOUTUBE_KEY");
  if (!key) return json({ error: "YOUTUBE_KEY secret is not set" }, 500);
  let q = new URL(req.url).searchParams.get("q") || "";
  if (!q && req.method === "POST") q = (await req.json().catch(() => ({})))?.q || "";
  q = String(q).trim().slice(0, 200);
  if (!q) return json({ error: "Missing q" }, 400);

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({ part: "snippet", type: "video", maxResults: "5", videoEmbeddable: "true", q, key }).toString();
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return json({ error: data?.error?.message || "YouTube search failed" }, 502);
  const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  return json({
    videos: (data.items || []).map((it: any) => ({
      videoId: it.id?.videoId,
      title: decode(it.snippet?.title || ""),
      channel: decode(it.snippet?.channelTitle || ""),
      thumb: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || null,
    })).filter((v: any) => v.videoId),
  });
});
