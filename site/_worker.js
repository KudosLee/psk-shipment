function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || env.APP_ORIGIN || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

function resolveOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = getAllowedOrigins(env);

  if (allowed.includes(origin)) return origin;
  return allowed[0] || "";
}

function corsHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(request, env),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, x-upload-key, x-upload-user",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(data, status, request, env, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function empty(status, request, env, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: {
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(";").map(v => v.trim());
  const row = parts.find(v => v.startsWith(name + "="));
  return row ? row.substring(name.length + 1) : "";
}

function toBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromUtf8(str) {
  return new TextEncoder().encode(str);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", fromUtf8(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2Hash(password, saltText, iterations = 100000) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    fromUtf8(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromUtf8(saltText),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2$${iterations}$${saltText}$${hashHex}`;
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("pbkdf2$")) return false;

  const parts = stored.split("$");
  if (parts.length !== 4) return false;

  const iterations = Number(parts[1]);
  const saltText = parts[2];
  const expected = parts[3];

  const hashed = await pbkdf2Hash(password, saltText, iterations);
  return hashed === stored && expected.length > 0;
}

function makeRandomString(len = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return toBase64Url(bytes);
}

function buildSessionCookie(token, maxAgeSec = 60 * 60 * 8) {
  return [
    `psk_session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${maxAgeSec}`,
  ].join("; ");
}

function clearSessionCookie() {
  return [
    "psk_session=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Max-Age=0",
  ].join("; ");
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "";
}

function getUserAgent(request) {
  return request.headers.get("User-Agent") || "";
}

function normalizeShipmentPayload(payload) {
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const meta = root.meta && typeof root.meta === "object" && !Array.isArray(root.meta) ? root.meta : {};
  const data = Array.isArray(root.data) ? root.data : [];
  return { meta, data };
}

async function writeAccessLog(env, log) {
  await env.DB.prepare(`
    INSERT INTO access_logs (
      user_id,
      username_snapshot,
      action,
      ip,
      user_agent,
      success,
      memo
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    log.userId ?? null,
    log.username ?? null,
    log.action ?? "",
    log.ip ?? "",
    log.userAgent ?? "",
    log.success ? 1 : 0,
    log.memo ?? null
  ).run();
}

async function getSessionUser(request, env) {
  const sessionToken = getCookie(request, "psk_session");
  if (!sessionToken) return null;

  const tokenHash = await sha256Hex(sessionToken);

  const row = await env.DB.prepare(`
    SELECT
      s.id AS session_id,
      s.user_id,
      s.expires_at,
      u.username,
      u.role,
      u.display_name,
      u.is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token_hash = ?
      AND datetime(s.expires_at) > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first();

  if (!row) return null;
  if (Number(row.is_active) !== 1) return null;

  await env.DB.prepare(`
    UPDATE sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(row.session_id).run();

  return row;
}

async function requireUser(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return {
      ok: false,
      response: json({ ok: false, message: "UNAUTHORIZED" }, 401, request, env),
    };
  }
  return { ok: true, user };
}

async function requireAdmin(request, env) {
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth;
  if (auth.user.role !== "ADMIN") {
    return {
      ok: false,
      response: json({ ok: false, message: "FORBIDDEN" }, 403, request, env),
    };
  }
  return auth;
}

async function getShipmentSnapshotColumns(env) {
  const result = await env.DB.prepare("PRAGMA table_info('shipment_snapshots')").all();
  const rows = result.results || [];
  const names = new Set(rows.map(r => String(r.name || "").trim()).filter(Boolean));

  return {
    hasPayloadJson: names.has("payload_json"),
    activeCol: names.has("is_active") ? "is_active" : (names.has("active") ? "active" : null),
    createdAtCol: names.has("created_at") ? "created_at" : (names.has("uploaded_at") ? "uploaded_at" : null),
    updatedAtCol: names.has("updated_at") ? "updated_at" : null,
    idCol: names.has("id") ? "id" : null,
  };
}

function buildShipmentOrderClause(cols) {
  const parts = [];
  if (cols.createdAtCol) parts.push(`${cols.createdAtCol} DESC`);
  if (cols.updatedAtCol) parts.push(`${cols.updatedAtCol} DESC`);
  if (cols.idCol) parts.push(`${cols.idCol} DESC`);
  return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
}

async function fetchCurrentShipmentSnapshot(env) {
  const cols = await getShipmentSnapshotColumns(env);

  if (!cols.hasPayloadJson) {
    throw new Error("shipment_snapshots.payload_json column is required");
  }

  const orderBy = buildShipmentOrderClause(cols);

  if (cols.activeCol) {
    const activeRow = await env.DB.prepare(`
      SELECT payload_json
      FROM shipment_snapshots
      WHERE ${cols.activeCol} = 1
      ${orderBy}
      LIMIT 1
    `).first();

    if (activeRow) return activeRow;
  }

  const latestRow = await env.DB.prepare(`
    SELECT payload_json
    FROM shipment_snapshots
    ${orderBy}
    LIMIT 1
  `).first();

  return latestRow || null;
}

async function saveShipmentSnapshot(env, payload) {
  const payloadJson = typeof payload === "string" ? payload : JSON.stringify(payload);
  const snapshotId = crypto.randomUUID();

  const pragma = await env.DB.prepare(`PRAGMA table_info('shipment_snapshots')`).all();
  const cols = new Set((pragma.results || []).map(r => String(r.name || "").trim()));

  const hasPayloadJson = cols.has("payload_json");
  const activeCol = cols.has("is_active") ? "is_active" : (cols.has("active") ? "active" : "");
  const createdAtCol = cols.has("created_at") ? "created_at" : "";
  const uploadedAtCol = cols.has("uploaded_at") ? "uploaded_at" : "";

  if (!hasPayloadJson) {
    throw new Error("shipment_snapshots.payload_json column not found");
  }

  if (activeCol) {
    await env.DB.prepare(`
      UPDATE shipment_snapshots
      SET ${activeCol} = 0
    `).run();
  }

  const insertCols = ["snapshot_id", "payload_json"];
  const placeholders = ["?", "?"];
  const bindValues = [snapshotId, payloadJson];

  if (activeCol) {
    insertCols.push(activeCol);
    placeholders.push("?");
    bindValues.push(1);
  }

  if (createdAtCol) {
    insertCols.push(createdAtCol);
    placeholders.push("CURRENT_TIMESTAMP");
  } else if (uploadedAtCol) {
    insertCols.push(uploadedAtCol);
    placeholders.push("CURRENT_TIMESTAMP");
  }

  await env.DB.prepare(`
    INSERT INTO shipment_snapshots (${insertCols.join(", ")})
    VALUES (${placeholders.join(", ")})
  `).bind(...bindValues).run();

  return snapshotId;
}

async function handleDebugCookie(request, env) {
  const rawCookie = request.headers.get("Cookie") || "";
  const cookieNames = rawCookie
    ? rawCookie
        .split(";")
        .map(v => v.trim())
        .map(v => v.split("=")[0])
        .filter(Boolean)
    : [];

  let sessionUser = null;
  try {
    sessionUser = await getSessionUser(request, env);
  } catch {
    sessionUser = null;
  }

  return json({
    ok: true,
    debug: {
      origin: request.headers.get("Origin") || "",
      referer: request.headers.get("Referer") || "",
      host: request.headers.get("Host") || "",
      method: request.method,
      userAgent: getUserAgent(request),
      hasCookieHeader: rawCookie.length > 0,
      cookieNames,
      hasPskSessionCookie: cookieNames.includes("psk_session"),
      allowedOrigins: getAllowedOrigins(env),
      resolvedOrigin: resolveOrigin(request, env),
      sessionUser: sessionUser
        ? {
            id: sessionUser.user_id,
            username: sessionUser.username,
            role: sessionUser.role,
            displayName: sessionUser.display_name || sessionUser.username,
          }
        : null,
    }
  }, 200, request, env);
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (!username || !password) {
    return json({ ok: false, message: "username/password required" }, 400, request, env);
  }

  const user = await env.DB.prepare(`
    SELECT id, username, password_hash, role, is_active, display_name
    FROM users
    WHERE username = ?
    LIMIT 1
  `).bind(username).first();

  if (!user || Number(user.is_active) !== 1) {
    await writeAccessLog(env, {
      userId: null,
      username,
      action: "LOGIN_FAIL",
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
      success: false,
      memo: "user not found or inactive",
    });
    return json({ ok: false, message: "INVALID_LOGIN" }, 401, request, env);
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    await writeAccessLog(env, {
      userId: user.id,
      username: user.username,
      action: "LOGIN_FAIL",
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
      success: false,
      memo: "wrong password",
    });
    return json({ ok: false, message: "INVALID_LOGIN" }, 401, request, env);
  }

  const rawToken = makeRandomString(32) + "." + makeRandomString(16);
  const tokenHash = await sha256Hex(rawToken);

  await env.DB.prepare(`
    INSERT INTO sessions (
      user_id,
      session_token_hash,
      expires_at,
      ip,
      user_agent,
      last_seen_at
    ) VALUES (
      ?,
      ?,
      datetime('now', '+8 hours'),
      ?,
      ?,
      CURRENT_TIMESTAMP
    )
  `).bind(
    user.id,
    tokenHash,
    getClientIp(request),
    getUserAgent(request)
  ).run();

  await env.DB.prepare(`
    UPDATE users
    SET last_login_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(user.id).run();

  await writeAccessLog(env, {
    userId: user.id,
    username: user.username,
    action: "LOGIN_SUCCESS",
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    success: true,
    memo: null,
  });

  return json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name || user.username,
    }
  }, 200, request, env, {
    "Set-Cookie": buildSessionCookie(rawToken),
  });
}

async function handleMe(request, env) {
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  return json({
    ok: true,
    user: {
      id: auth.user.user_id,
      username: auth.user.username,
      role: auth.user.role,
      displayName: auth.user.display_name || auth.user.username,
    }
  }, 200, request, env);
}

async function handleLogout(request, env) {
  const sessionToken = getCookie(request, "psk_session");

  if (sessionToken) {
    const tokenHash = await sha256Hex(sessionToken);

    const row = await env.DB.prepare(`
      SELECT s.id, u.id AS user_id, u.username
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token_hash = ?
      LIMIT 1
    `).bind(tokenHash).first();

    await env.DB.prepare(`
      DELETE FROM sessions
      WHERE session_token_hash = ?
    `).bind(tokenHash).run();

    if (row) {
      await writeAccessLog(env, {
        userId: row.user_id,
        username: row.username,
        action: "LOGOUT",
        ip: getClientIp(request),
        userAgent: getUserAgent(request),
        success: true,
        memo: null,
      });
    }
  }

  return json({ ok: true }, 200, request, env, {
    "Set-Cookie": clearSessionCookie(),
  });
}

async function handleAdminLogs(request, env) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const rows = await env.DB.prepare(`
    SELECT
      id,
      username_snapshot,
      action,
      ip,
      user_agent,
      success,
      memo,
      created_at
    FROM access_logs
    ORDER BY id DESC
    LIMIT 100
  `).all();

  return json({
    ok: true,
    items: rows.results || []
  }, 200, request, env);
}

async function handleCurrentShipments(request, env) {
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const row = await fetchCurrentShipmentSnapshot(env);

  await writeAccessLog(env, {
    userId: auth.user.user_id,
    username: auth.user.username,
    action: "VIEW_CURRENT",
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    success: true,
    memo: row ? "active snapshot served" : "no active snapshot",
  });

  if (!row || !row.payload_json) {
    return json({
      ok: true,
      meta: {},
      data: []
    }, 200, request, env);
  }

  let parsed;
  try {
    parsed = JSON.parse(row.payload_json);
  } catch {
    return json({ ok: false, message: "INVALID_SNAPSHOT_PAYLOAD" }, 500, request, env);
  }

  const normalized = normalizeShipmentPayload(parsed);

  return json({
    ok: true,
    meta: normalized.meta,
    data: normalized.data
  }, 200, request, env);
}

async function handleAdminShipmentUpload(request, env) {
  const uploadKey = request.headers.get("x-upload-key") || "";
  const expectedKey = String(env.SHIPMENT_UPLOAD_KEY || "").trim();

  if (!expectedKey) {
    return json({ ok: false, message: "UPLOAD_KEY_NOT_CONFIGURED" }, 500, request, env);
  }

  if (!uploadKey || uploadKey !== expectedKey) {
    await writeAccessLog(env, {
      userId: null,
      username: null,
      action: "SHIPMENT_UPLOAD_FAIL",
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
      success: false,
      memo: "invalid x-upload-key",
    });
    return json({ ok: false, message: "FORBIDDEN" }, 403, request, env);
  }

  const body = await readJson(request);
  const normalized = normalizeShipmentPayload(body);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, message: "INVALID_JSON_BODY" }, 400, request, env);
  }

  if (!("meta" in body) || !("data" in body)) {
    return json({ ok: false, message: "meta/data required" }, 400, request, env);
  }

  if (!Array.isArray(body.data)) {
    return json({ ok: false, message: "data must be array" }, 400, request, env);
  }

  const payloadToStore = JSON.stringify({
    meta: normalized.meta,
    data: normalized.data,
  });

  const snapshotId = await saveShipmentSnapshot(env, payloadToStore);

  await writeAccessLog(env, {
    userId: null,
    username: null,
    action: "SHIPMENT_UPLOAD_SUCCESS",
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    success: true,
    memo: `rows=${normalized.data.length}`,
  });

  return json({
    ok: true,
    meta: normalized.meta,
    data: normalized.data,
    saved: {
      success: !!snapshotId,
      meta: null,
      snapshotId: snapshotId || null,
    }
  }, 200, request, env);
}

async function handleBootstrap(request, env) {
  const adminCountRow = await env.DB.prepare(`
    SELECT COUNT(*) AS cnt
    FROM users
    WHERE role = 'ADMIN'
  `).first();

  if (Number(adminCountRow?.cnt || 0) > 0) {
    return json({ ok: false, message: "ADMIN_ALREADY_EXISTS" }, 400, request, env);
  }

  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();
  const displayName = String(body.displayName || "").trim();

  if (!username || !password) {
    return json({ ok: false, message: "username/password required" }, 400, request, env);
  }

  const salt = makeRandomString(16);
  const passwordHash = await pbkdf2Hash(password, salt);

  await env.DB.prepare(`
    INSERT INTO users (
      username,
      password_hash,
      role,
      is_active,
      display_name
    ) VALUES (?, ?, 'ADMIN', 1, ?)
  `).bind(username, passwordHash, displayName || username).run();

  await writeAccessLog(env, {
    userId: null,
    username,
    action: "BOOTSTRAP_ADMIN",
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    success: true,
    memo: "initial admin created",
  });

  return json({
    ok: true,
    message: "ADMIN_CREATED",
    username,
  }, 200, request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log("FETCH_START", request.url);
    console.log("PATHNAME", new URL(request.url).pathname);
    // 1) API 요청만 직접 처리.
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