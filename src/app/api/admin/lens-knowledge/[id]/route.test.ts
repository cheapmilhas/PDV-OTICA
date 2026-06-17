import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
}));
vi.mock("@/services/lens-knowledge.service", () => ({
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

import { PATCH, DELETE } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { updateDoc, deleteDoc } from "@/services/lens-knowledge.service";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockUpdateDoc = vi.mocked(updateDoc);
const mockDeleteDoc = vi.mocked(deleteDoc);

const adminPayload = { id: "admin-1", email: "a@a.com", name: "Admin", role: "SUPER_ADMIN", isAdmin: true };
const nonSuperAdmin = { id: "admin-2", email: "b@b.com", name: "Admin Comum", role: "ADMIN", isAdmin: true };

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/lens-knowledge/doc-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/lens-knowledge/[id]", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockUpdateDoc.mockReset();
    mockDeleteDoc.mockReset();
  });

  it("401 when getAdminSession returns null (updateDoc not called)", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ active: false }), makeParams("doc-1"));
    expect(res.status).toBe(401);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("403 quando admin não é SUPER_ADMIN (updateDoc não chamado)", async () => {
    mockGetAdminSession.mockResolvedValue(nonSuperAdmin);
    const res = await PATCH(makeRequest({ active: false }), makeParams("doc-1"));
    expect(res.status).toBe(403);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("200 with { active: false } calls updateDoc(id, { active: false }) and returns { data: result }", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    const result = { id: "doc-1", active: false };
    mockUpdateDoc.mockResolvedValue(result as never);

    const res = await PATCH(makeRequest({ active: false }), makeParams("doc-1"));
    expect(res.status).toBe(200);
    expect(mockUpdateDoc).toHaveBeenCalledWith("doc-1", { active: false });

    const json = await res.json();
    expect(json.data).toEqual(result);
  });

  it("200 with { title, content } calls updateDoc with those fields", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockUpdateDoc.mockResolvedValue({ id: "doc-1" } as never);

    await PATCH(makeRequest({ title: "Novo título", content: "Novo conteúdo" }), makeParams("doc-1"));
    expect(mockUpdateDoc).toHaveBeenCalledWith("doc-1", {
      title: "Novo título",
      content: "Novo conteúdo",
    });
  });
});

describe("DELETE /api/admin/lens-knowledge/[id]", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockUpdateDoc.mockReset();
    mockDeleteDoc.mockReset();
  });

  it("401 when getAdminSession returns null (deleteDoc not called)", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await DELETE(makeRequest({}), makeParams("doc-1"));
    expect(res.status).toBe(401);
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it("200 with session calls deleteDoc(id) and returns ok", async () => {
    mockGetAdminSession.mockResolvedValue(adminPayload);
    mockDeleteDoc.mockResolvedValue(undefined as never);

    const res = await DELETE(makeRequest({}), makeParams("doc-1"));
    expect(res.status).toBe(200);
    expect(mockDeleteDoc).toHaveBeenCalledWith("doc-1");

    const json = await res.json();
    expect(json.data).toEqual({ ok: true });
  });
});
