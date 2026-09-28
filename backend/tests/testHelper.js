import mongoose from "mongoose";
import app from "../src/app.js";

const TEST_MONGO_URI = "mongodb://127.0.0.1:27017/scion_test";

/**
 * Initializes test environment, connects to test database, and starts ephemeral server.
 */
export async function setupTestEnvironment() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "scion_test_super_secret_jwt_key_987654";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.MONGODB_URI = TEST_MONGO_URI;

  if (mongoose.connection.readyState !== 1) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(TEST_MONGO_URI);
  }

  // Clear test database collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const apiRequest = async (path, { method = "GET", body, cookie, headers = {} } = {}) => {
    const reqHeaders = { ...headers };
    if (body) {
      reqHeaders["Content-Type"] = "application/json";
    }
    if (cookie) {
      reqHeaders["Cookie"] = cookie;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const setCookie = response.headers.get("set-cookie");

    return {
      status: response.status,
      headers: response.headers,
      data,
      setCookie,
    };
  };

  const teardown = async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      const colls = mongoose.connection.collections;
      for (const k in colls) {
        await colls[k].deleteMany({});
      }
      await mongoose.disconnect();
    }
  };

  return { baseUrl, server, apiRequest, teardown };
}
