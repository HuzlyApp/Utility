// Accept attribute + client-side allow list mirroring server validation (spec §5/§7).
export const ACCEPT_ATTR =
  ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp";

export const ALLOWED_EXTS = ["pdf", "doc", "docx", "txt", "jpg", "jpeg", "png", "webp"];
export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"];

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}
