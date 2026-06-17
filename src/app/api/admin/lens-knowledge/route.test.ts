import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
}));
vi.mock("@/services/lens-knowledge.service", () => ({
  listDocs: vi.fn(),
  createDoc: vi.fn(),
}));

import { GET, POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { listDocs, createDoc } from "@/services/lens-knowledge.service";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockListDocs = vi.mocked(listDocs);
const mockCreateDoc = vi.mocked(createDoc);

const adminPayload = { id: "admin-1", email: "a@a.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true };

const docsFixture = [
  { id: "d1", title: "Global", content: "c1", companyId: null },
  { id: "d2", title: "Ótica X", content: "c2", companyId: "abc" },
];

const createdFixture = { id: "d3", title: "Novo", content: "conteúdo", companyId: null, createdByAdminId: "admin-1" };

function makeGetRequest() {
  return new Request("http://localhost/api/admin/lens-knowledge", { method: "GET" });
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/lens-knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/lens-knowledge", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockListDocs.mockReset();
    mockCreateDoc.mockReset();
  });

  it("401 when getAdminSession returns null", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockListDocs).not.toHaveBeenCalled();
  });

  it("200 returns { data: listDocs result } and calls listDocs", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockListDocs.mockResolvedValue(docsFixture as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockListDocs).toHaveBeenCalledTimes(1);

    const json = await res.json();
    expect(json.data).toEqual(docsFixture);
  });
});

describe("POST /api/admin/lens-knowledge", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockListDocs.mockReset();
    mockCreateDoc.mockReset();
  });

  it("401 when getAdminSession returns null", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await POST(makePostRequest({ title: "T", content: "C", companyId: null }));
    expect(res.status).toBe(401);
    expect(mockCreateDoc).not.toHaveBeenCalled();
  });

  it("200 cria doc global com createdByAdminId = admin.id", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockCreateDoc.mockResolvedValue(createdFixture as never);

    const body = { title: "Novo", content: "conteúdo", companyId: null };
    const res = await POST(makePostRequest(body));
    expect(res.status).toBe(200);

    expect(mockCreateDoc).toHaveBeenCalledWith({
      title: "Novo",
      content: "conteúdo",
      companyId: null,
      createdByAdminId: "admin-1",
    });

    const json = await res.json();
    expect(json.data).toEqual(createdFixture);
  });

  it("200 com companyId 'abc' (ótica específica) passa companyId 'abc'", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockCreateDoc.mockResolvedValue({ ...createdFixture, companyId: "abc" } as never);

    const res = await POST(makePostRequest({ title: "T", content: "C", companyId: "abc" }));
    expect(res.status).toBe(200);

    const callArg = mockCreateDoc.mock.calls[0][0];
    expect(callArg).toHaveProperty("companyId", "abc");
  });

  it("400 quando falta title (não chama createDoc)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    const res = await POST(makePostRequest({ content: "C", companyId: null }));
    expect(res.status).toBe(400);
    expect(mockCreateDoc).not.toHaveBeenCalled();
  });

  it("400 quando falta content (não chama createDoc)", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    const res = await POST(makePostRequest({ title: "T", companyId: null }));
    expect(res.status).toBe(400);
    expect(mockCreateDoc).not.toHaveBeenCalled();
  });
});
