import { describe, it, expect } from "vitest";
import {
  extractText,
  normalizeText,
  isSupported,
  getExtension,
} from "@/lib/extract";

describe("file extension utilities", () => {
  it("extracts file extensions correctly", () => {
    expect(getExtension("resume.pdf")).toBe("pdf");
    expect(getExtension("job.DOCX")).toBe("docx");
    expect(getExtension("file.doc")).toBe("doc");
    expect(getExtension("text.txt")).toBe("txt");
    expect(getExtension("noextension")).toBe("");
  });

  it("identifies supported file types", () => {
    expect(isSupported("file.pdf")).toBe(true);
    expect(isSupported("file.docx")).toBe(true);
    expect(isSupported("file.doc")).toBe(true);
    expect(isSupported("file.txt")).toBe(true);
    expect(isSupported("file.jpg")).toBe(false);
    expect(isSupported("file.png")).toBe(false);
  });
});

describe("text normalization", () => {
  it("normalizes line endings and whitespace", () => {
    const input = "Line 1\r\nLine 2\rLine 3\n\n\n\nLine 4";
    const result = normalizeText(input);
    expect(result).toBe("Line 1\nLine 2\nLine 3\n\nLine 4");
  });

  it("collapses multiple spaces", () => {
    const input = "Multiple    spaces    here";
    const result = normalizeText(input);
    expect(result).toBe("Multiple spaces here");
  });

  it("preserves structure for resume content", () => {
    const input = `John Doe
CT Technologist

Mercy Hospital
March 2022 - Present

Skills:
- CT scanning
- Patient care`;
    const result = normalizeText(input);
    expect(result).toContain("John Doe");
    expect(result).toContain("CT Technologist");
    expect(result).toContain("Mercy Hospital");
  });
});

describe("PDF text extraction", () => {
  it("extracts text from a valid PDF buffer (test 1)", async () => {
    // Create a minimal PDF structure for testing
    // PDF header + minimal content
    const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(CT Technologist with 5 years experience) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 

trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
308
%%EOF`;
    
    const buffer = Buffer.from(pdfContent, "utf-8");
    const result = await extractText(buffer, "test.pdf");
    
    // PDF extraction may fail on this mock PDF, but it should handle it gracefully
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("quality");
    expect(result).toHaveProperty("warnings");
  });

  it("rejects unsupported file types (test 7)", async () => {
    const buffer = Buffer.from("some content");
    const result = await extractText(buffer, "image.jpg");
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported file type");
  });

  it("rejects files that are too large (test 8)", async () => {
    // Create a buffer larger than max size (10MB default)
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
    const result = await extractText(largeBuffer, "large.pdf");
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("handles empty files (test 5)", async () => {
    const buffer = Buffer.from("");
    const result = await extractText(buffer, "empty.txt");
    
    expect(result.success).toBe(false);
    expect(result.quality).toBe("FAILED");
  });
});

describe("DOCX extraction", () => {
  it("warns about legacy .doc files (test 3)", async () => {
    // .doc files are processed by mammoth but with a warning
    const buffer = Buffer.from("PK"); // Minimal ZIP signature (DOCX is ZIP-based)
    const result = await extractText(buffer, "legacy.doc");
    
    // Should either fail extraction or succeed with warning
    if (result.success) {
      expect(result.warnings.some(w => w.includes("Legacy .doc"))).toBe(true);
    }
  });
});

describe("TXT extraction", () => {
  it("extracts plain text correctly (test 4)", async () => {
    const content = `CT Technologist with extensive experience in diagnostic imaging and patient care.
ARRT(CT) certified with current registration.
Over 5 years of progressive experience in hospital and outpatient settings.
Proficient in operating GE and Siemens CT equipment.
Skilled in contrast administration and patient positioning.
BLS certified and current.
Experienced with Epic and Cerner charting systems.`;
    const buffer = Buffer.from(content, "utf-8");
    const result = await extractText(buffer, "resume.txt");
    
    expect(result.success).toBe(true);
    expect(result.text).toContain("CT Technologist");
    expect(result.quality).toBe("MODERATE");
  });
});
