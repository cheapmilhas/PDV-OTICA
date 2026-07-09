import { describe, it, expect } from "vitest";
import { LEAD_STAGE_KEYS, findStageByKey } from "@/lib/lead-stage-keys";

describe("lead-stage-keys", () => {
  const stages = [
    { id: "s1", systemKey: null },
    { id: "s2", systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
    { id: "s3", systemKey: "OUTRO" },
  ];

  it("acha o estágio pela flag estável (não pelo nome)", () => {
    expect(findStageByKey(stages, LEAD_STAGE_KEYS.EXAM_DONE)?.id).toBe("s2");
  });

  it("retorna null quando nenhum estágio tem a flag", () => {
    const semExame = [{ id: "s1", systemKey: null }];
    expect(findStageByKey(semExame, LEAD_STAGE_KEYS.EXAM_DONE)).toBeNull();
  });

  it("EXAM_DONE é a string estável esperada", () => {
    expect(LEAD_STAGE_KEYS.EXAM_DONE).toBe("EXAM_DONE");
  });
});
