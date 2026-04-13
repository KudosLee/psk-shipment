export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1) API 요청만 직접 처리
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") {
        return empty(204, request, env);
      }

      if (url.pathname === "/api/ping" && request.method === "GET") {
        return json({ ok: true, message: "worker alive" }, 200, request, env);
      }

      if (url.pathname === "/api/db-test" && request.method === "GET") {
        const row = await env.DB
          .prepare("SELECT datetime('now') AS now_time, 'DB_OK' AS status")
          .first();
        return json({ ok: true, db: row }, 200, request, env);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return handleLogin(request, env);
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        return handleMe(request, env);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return handleLogout(request, env);
      }

      if (url.pathname === "/api/admin/logins" && request.method === "GET") {
        return handleAdminLogs(request, env);
      }

      if (url.pathname === "/api/shipments/current" && request.method === "GET") {
        return handleCurrentShipments(request, env);
      }

      if (url.pathname === "/api/admin/shipments/upload" && request.method === "POST") {
        return handleAdminShipmentUpload(request, env);
      }

      if (url.pathname === "/api/admin/bootstrap" && request.method === "POST") {
        return handleBootstrap(request, env);
      }

      return json({ ok: false, message: "NOT_FOUND" }, 404, request, env);
    }

    // 2) API가 아니면 정적 파일 반환
    return env.ASSETS.fetch(request);
  }
};