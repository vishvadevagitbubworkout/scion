import http from "node:http";
import mongoose from "mongoose";
import app from "../app.js";
import { clearSentEmails } from "../services/emailService.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-at-least-32-chars-long-random-string-123456";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/scion_test_isolated";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.EMAIL_PROVIDER = "resend";
process.env.EMAIL_FROM = "Scion <no-reply@example.test>";

export class TestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  setCookie(name, value) {
    this.cookies.set(name, value);
  }

  clearCookies() {
    this.cookies.clear();
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = { ...options.headers };

    if (this.cookies.size > 0 && !headers.cookie && !headers.Cookie) {
      headers.Cookie = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }

    if (options.body && typeof options.body === "object" && !(options.body instanceof String)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });

    // Extract Set-Cookie headers
    const rawSetCookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : []);

    for (const sc of rawSetCookies) {
      const match = sc.match(/^([^=;]+)=([^;]*)/);
      if (match) {
        const [, name, val] = match;
        const trimmedName = name.trim();
        if (val === "" || /Max-Age=0/i.test(sc) || /expires=Thu, 01 Jan 1970/i.test(sc)) {
          this.cookies.delete(trimmedName);
        } else {
          this.cookies.set(trimmedName, val);
        }
      }
    }

    let body;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    return {
      status: response.status,
      headers: response.headers,
      body,
      ok: response.ok,
    };
  }

  get(path, options = {}) {
    return this.request(path, { ...options, method: "GET" });
  }

  post(path, body, options = {}) {
    return this.request(path, { ...options, method: "POST", body });
  }

  put(path, body, options = {}) {
    return this.request(path, { ...options, method: "PUT", body });
  }

  patch(path, body, options = {}) {
    return this.request(path, { ...options, method: "PATCH", body });
  }

  delete(path, options = {}) {
    return this.request(path, { ...options, method: "DELETE" });
  }
}

export async function setupTestEnvironment(dbName = "scion_test_isolated") {
  const uri = `mongodb://127.0.0.1:27017/${dbName}`;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri);

  // Clear all collections in isolated test DB
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }

  clearSentEmails();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    baseUrl,
    client: new TestClient(baseUrl),
    createClient: () => new TestClient(baseUrl),
    teardown: async () => {
      clearSentEmails();
      await new Promise((resolve) => server.close(resolve));
      if (mongoose.connection.readyState !== 0) {
        try {
          await mongoose.connection.dropDatabase();
        } catch {
          // ignore cleanup error
        }
        await mongoose.disconnect();
      }
    },
  };
}
