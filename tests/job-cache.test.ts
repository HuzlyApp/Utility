import { describe, it, expect, beforeEach } from "vitest";
import {
  getCachedJobRequirements,
  setCachedJobRequirements,
  invalidateJobCache,
  getCacheStats,
  extractBasicRequirements,
  type NormalizedJobRequirements,
} from "@/lib/job-cache";

describe("Job Cache", () => {
  const tenantId = "tenant-123";
  const jobDescription = "Registered Nurse position requiring BSN and 2 years experience. Must have current RN license and BLS certification.";
  const structuredFields = {
    specialty: "RN",
    required_licenses: "RN",
    required_certifications: "BLS",
    minimum_years_experience: "2",
  };

  const mockRequirements: NormalizedJobRequirements = {
    contentHash: "test-hash-123",
    generatedAt: new Date().toISOString(),
    version: "1.0",
    mandatoryRequirements: [
      { id: "1", text: "RN License", type: "mandatory", category: "license" },
      { id: "2", text: "2 years experience", type: "mandatory", category: "experience" },
    ],
    preferredRequirements: [
      { id: "3", text: "BSN degree", type: "preferred", category: "education" },
    ],
    requiredLicenses: ["RN"],
    requiredCertifications: ["BLS"],
    requiredExperience: [{ specialty: "RN", years: 2, isMinimum: true }],
    requiredSpecialties: ["RN"],
    locationConstraints: [],
    educationRequirements: [],
    requiredSkills: [],
    requiredWorkSettings: [],
    scheduleRequirements: [],
    contextualInfo: {},
  };

  beforeEach(() => {
    invalidateJobCache();
  });

  describe("getCachedJobRequirements", () => {
    it("returns null when no cached entry exists", () => {
      const result = getCachedJobRequirements(tenantId, jobDescription, structuredFields);
      expect(result).toBeNull();
    });

    it("returns cached requirements when entry exists", () => {
      setCachedJobRequirements(tenantId, jobDescription, mockRequirements, structuredFields);
      const result = getCachedJobRequirements(tenantId, jobDescription, structuredFields);
      expect(result).not.toBeNull();
      expect(result?.contentHash).toBe("test-hash-123");
      expect(result?.mandatoryRequirements).toHaveLength(2);
    });

    it("returns null for different tenant (tenant isolation)", () => {
      setCachedJobRequirements(tenantId, jobDescription, mockRequirements, structuredFields);
      const result = getCachedJobRequirements("different-tenant", jobDescription, structuredFields);
      expect(result).toBeNull();
    });

    it("returns null when job description changes (content hash mismatch)", () => {
      setCachedJobRequirements(tenantId, jobDescription, mockRequirements, structuredFields);
      const modifiedJob = jobDescription + " Additional requirement.";
      const result = getCachedJobRequirements(tenantId, modifiedJob, structuredFields);
      expect(result).toBeNull();
    });

    it("expires entries after TTL", () => {
      const originalTtl = process.env.JOB_CACHE_TTL_MS;
      process.env.JOB_CACHE_TTL_MS = "1";

      setCachedJobRequirements(tenantId, jobDescription, mockRequirements, structuredFields);

      const start = Date.now();
      while (Date.now() - start < 10) {}

      const result = getCachedJobRequirements(tenantId, jobDescription, structuredFields);
      expect(result).toBeNull();

      process.env.JOB_CACHE_TTL_MS = originalTtl;
    });
  });

  describe("setCachedJobRequirements", () => {
    it("stores requirements in cache", () => {
      setCachedJobRequirements(tenantId, jobDescription, mockRequirements, structuredFields);
      const stats = getCacheStats();
      expect(stats.size).toBe(1);
    });

    it("updates access count on retrieval", () => {
      setCachedJobRequirements(tenantId, jobDescription, mockRequirements, structuredFields);
      getCachedJobRequirements(tenantId, jobDescription, structuredFields);
      getCachedJobRequirements(tenantId, jobDescription, structuredFields);
      getCachedJobRequirements(tenantId, jobDescription, structuredFields);

      const stats = getCacheStats();
      expect(stats.entries[0].accessCount).toBe(4);
    });

    it("evicts LRU entry when cache is full", () => {
      const originalMax = process.env.JOB_CACHE_MAX_SIZE;
      process.env.JOB_CACHE_MAX_SIZE = "2";

      setCachedJobRequirements("tenant-1", "Job 1", { ...mockRequirements, contentHash: "1" }, {});
      let t = Date.now();
      while (Date.now() - t < 5) {}

      setCachedJobRequirements("tenant-2", "Job 2", { ...mockRequirements, contentHash: "2" }, {});
      t = Date.now();
      while (Date.now() - t < 5) {}

      setCachedJobRequirements("tenant-3", "Job 3", { ...mockRequirements, contentHash: "3" }, {});

      const stats = getCacheStats();
      expect(stats.size).toBe(2);

      const result = getCachedJobRequirements("tenant-1", "Job 1", {});
      expect(result).toBeNull();

      process.env.JOB_CACHE_MAX_SIZE = originalMax;
    });
  });

  describe("invalidateJobCache", () => {
    it("clears all entries when no tenant specified", () => {
      setCachedJobRequirements("tenant-1", jobDescription, mockRequirements, structuredFields);
      setCachedJobRequirements("tenant-2", jobDescription, mockRequirements, structuredFields);
      invalidateJobCache();
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
    });

    it("clears only specified tenant entries", () => {
      setCachedJobRequirements("tenant-1", jobDescription, mockRequirements, structuredFields);
      setCachedJobRequirements("tenant-2", jobDescription, mockRequirements, structuredFields);
      invalidateJobCache("tenant-1");
      const stats = getCacheStats();
      expect(stats.size).toBe(1);

      const result1 = getCachedJobRequirements("tenant-1", jobDescription, structuredFields);
      const result2 = getCachedJobRequirements("tenant-2", jobDescription, structuredFields);
      expect(result1).toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe("getCacheStats", () => {
    it("returns accurate cache statistics", () => {
      setCachedJobRequirements(tenantId, jobDescription, mockRequirements, structuredFields);
      const stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBeGreaterThan(0);
      expect(stats.ttlMs).toBeGreaterThan(0);
      expect(stats.entries).toHaveLength(1);
      expect(stats.entries[0].tenantId).toBe(tenantId);
      expect(stats.entries[0].accessCount).toBe(1);
    });
  });

  describe("extractBasicRequirements", () => {
    it("extracts license requirements", () => {
      const text = "Must have RN license and ARRT certification";
      const result = extractBasicRequirements(text);
      expect(result.requiredLicenses).toContain("RN");
    });

    it("extracts certification requirements", () => {
      const text = "Required: BLS, ACLS, and ARRT(CT) certification";
      const result = extractBasicRequirements(text);
      expect(result.requiredCertifications?.length).toBeGreaterThan(0);
    });

    it("includes specialty from structured fields", () => {
      const result = extractBasicRequirements("Some job", { specialty: "ICU" });
      expect(result.requiredSpecialties).toContain("ICU");
    });

    it("deduplicates extracted values", () => {
      const text = "RN license required. Must have current RN license.";
      const result = extractBasicRequirements(text);
      const uniqueCount = new Set(result.requiredLicenses).size;
      expect(result.requiredLicenses?.length).toBe(uniqueCount);
    });
  });
});
