// src/lib/observability/request-context.test.ts
import { describe, it, expect } from "vitest";
import { newRequestId, readRequestId, REQUEST_ID_HEADER } from "./request-context";

describe("request-context", () => {
  it("newRequestId gera id com prefixo req_ e sem hifens", () => {
    const id = newRequestId();
    expect(id).toMatch(/^req_[a-f0-9]{16}$/);
  });

  it("newRequestId gera ids distintos", () => {
    expect(newRequestId()).not.toBe(newRequestId());
  });

  it("readRequestId reusa o header existente quando presente", () => {
    const h = new Headers();
    h.set(REQUEST_ID_HEADER, "req_existing");
    expect(readRequestId(h)).toBe("req_existing");
  });

  it("readRequestId gera um novo quando ausente", () => {
    expect(readRequestId(new Headers())).toMatch(/^req_/);
  });
});
