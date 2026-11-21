import { ArangoError } from "./errors.mjs";

export class ArangoClient {
  constructor({ url, database, username, password, fetchImpl = fetch, timeoutMs = 10_000 }) {
    this.url = new URL(url);
    this.database = database;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.authorization = username
      ? `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`
      : "";
  }

  endpoint(path, system = false) {
    const database = system ? "_system" : this.database;
    return new URL(`/_db/${encodeURIComponent(database)}${path}`, this.url);
  }

  async request(path, { method = "GET", body, system = false, headers: extraHeaders = {} } = {}) {
    const headers = { Accept: "application/json", ...extraHeaders };
    if (this.authorization) headers.Authorization = this.authorization;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint(path, system), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload?.error === true) {
        throw new ArangoError(response.status, payload?.errorNum);
      }
      return payload;
    } catch (error) {
      if (error instanceof ArangoError) throw error;
      throw new ArangoError(0);
    } finally {
      clearTimeout(timer);
    }
  }

  async query(query, bindVars = {}, options = {}) {
    const { transactionId, ...queryOptions } = options;
    const transactionHeaders = transactionId ? { "x-arango-trx-id": transactionId } : {};
    const payload = await this.request("/_api/cursor", {
      method: "POST",
      body: { query, bindVars, ...queryOptions },
      ...(transactionId ? { headers: transactionHeaders } : {}),
    });
    const results = payload.result || [];
    let cursorId = payload.id;
    try {
      while (payload.hasMore && cursorId) {
        const next = await this.request(`/_api/cursor/${encodeURIComponent(cursorId)}`, { method: "PUT", headers: transactionHeaders });
        results.push(...(next.result || []));
        cursorId = next.id || cursorId;
        if (!next.hasMore) break;
      }
      return results;
    } finally {
      if (cursorId && payload.hasMore) {
        try { await this.request(`/_api/cursor/${encodeURIComponent(cursorId)}`, { method: "DELETE", headers: transactionHeaders }); } catch { /* cursor cleanup is best effort */ }
      }
    }
  }

  async version() {
    return this.request("/_api/version");
  }

  async beginTransaction({ read = [], write = [], exclusive = [], lockTimeout = 10 } = {}) {
    const collections = { ...(read.length ? { read } : {}), ...(write.length ? { write } : {}), ...(exclusive.length ? { exclusive } : {}) };
    const payload = await this.request("/_api/transaction/begin", {
      method: "POST",
      body: { collections, options: { lockTimeout } },
    });
    if (!payload?.result?.id) throw new ArangoError(0);
    return payload.result.id;
  }

  async commitTransaction(transactionId) {
    return this.request(`/_api/transaction/${encodeURIComponent(transactionId)}`, { method: "PUT" });
  }

  async abortTransaction(transactionId) {
    return this.request(`/_api/transaction/${encodeURIComponent(transactionId)}`, { method: "DELETE" });
  }
}
