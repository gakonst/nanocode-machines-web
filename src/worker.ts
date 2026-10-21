const device = "https://wallet.tempo.xyz/api/auth/device";

export default {
  async fetch(request: Request, env: { ASSETS: { fetch: (request: Request) => Promise<Response> } }) {
    const url = new URL(request.url);
    if (request.method === "POST" && (url.pathname === "/api/device/register" || url.pathname === "/api/device/token")) {
      const response = await fetch(`${device}${url.pathname.slice("/api/device".length)}`, {
        body: await request.text(),
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "POST",
      });
      return new Response(response.body, { headers: { "cache-control": "no-store", "content-type": response.headers.get("content-type") ?? "application/json" }, status: response.status });
    }
    return env.ASSETS.fetch(request);
  },
};
