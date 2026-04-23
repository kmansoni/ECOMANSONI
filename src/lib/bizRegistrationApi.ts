import { supabase } from "@/lib/supabase";

/**
 * Бизнес-регистрации (ИП / ЮЛ / Самозанятый).
 * Клиентская обёртка поверх таблиц business_legal_* и bucket business-legal-docs.
 */

export type BizLegalKind = "self_employed" | "entrepreneur" | "legal_entity";

export type BizLegalStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "needs_fixes"
  | "sent_to_fns"
  | "approved"
  | "rejected";

export type BizLegalPaymentStatus =
  | "not_required"
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

export type BizDocType =
  | "passport_main"
  | "passport_registration"
  | "inn_certificate"
  | "snils"
  | "application_form"
  | "charter"
  | "founder_decision"
  | "payment_receipt"
  | "address_proof"
  | "other";

export interface BizLegalApplication {
  id: string;
  user_id: string;
  kind: BizLegalKind;
  status: BizLegalStatus;
  form_data: Record<string, unknown>;
  okved_codes: string[];
  payment_status: BizLegalPaymentStatus;
  payment_reference: string | null;
  fns_reference: string | null;
  rejection_reason: string | null;
  review_comment: string | null;
  reviewer_admin_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BizLegalDocument {
  id: string;
  application_id: string;
  user_id: string;
  doc_type: BizDocType;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  ocr_data: Record<string, unknown> | null;
  verified: boolean;
  created_at: string;
}

export interface BizLegalStatusLogRow {
  id: string;
  application_id: string;
  from_status: BizLegalStatus | null;
  to_status: BizLegalStatus;
  actor_user_id: string | null;
  actor_admin_id: string | null;
  comment: string | null;
  created_at: string;
}

const BUCKET = "business-legal-docs";
const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function requireUserId(): Promise<string> {
  return supabase.auth.getUser().then(({ data, error }) => {
    if (error) throw error;
    const id = data.user?.id;
    if (!id) throw new Error("Not authenticated");
    return id;
  });
}

export async function createApplication(kind: BizLegalKind, initial: Record<string, unknown> = {}): Promise<BizLegalApplication> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("business_legal_applications")
    .insert({ user_id: userId, kind, status: "draft", form_data: initial })
    .select("*")
    .single();
  if (error) throw error;
  return data as BizLegalApplication;
}

export async function listOwnApplications(): Promise<BizLegalApplication[]> {
  const { data, error } = await supabase
    .from("business_legal_applications")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BizLegalApplication[];
}

export async function getApplication(id: string): Promise<{
  application: BizLegalApplication;
  documents: BizLegalDocument[];
  log: BizLegalStatusLogRow[];
}> {
  const [appRes, docsRes, logRes] = await Promise.all([
    supabase.from("business_legal_applications").select("*").eq("id", id).maybeSingle(),
    supabase.from("business_legal_documents").select("*").eq("application_id", id).order("created_at"),
    supabase.from("business_legal_status_log").select("*").eq("application_id", id).order("created_at", { ascending: false }),
  ]);
  if (appRes.error) throw appRes.error;
  if (!appRes.data) throw new Error("Application not found");
  if (docsRes.error) throw docsRes.error;
  if (logRes.error) throw logRes.error;
  return {
    application: appRes.data as BizLegalApplication,
    documents: (docsRes.data ?? []) as BizLegalDocument[],
    log: (logRes.data ?? []) as BizLegalStatusLogRow[],
  };
}

export async function updateApplicationDraft(id: string, patch: {
  form_data?: Record<string, unknown>;
  okved_codes?: string[];
}): Promise<BizLegalApplication> {
  const { data, error } = await supabase
    .from("business_legal_applications")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as BizLegalApplication;
}

export async function submitApplication(id: string): Promise<BizLegalApplication> {
  const { data, error } = await supabase
    .from("business_legal_applications")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as BizLegalApplication;
}

export async function deleteApplication(id: string): Promise<void> {
  const { error } = await supabase.from("business_legal_applications").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadDocument(params: {
  applicationId: string;
  docType: BizDocType;
  file: File;
  ocrData?: Record<string, unknown>;
}): Promise<BizLegalDocument> {
  const userId = await requireUserId();
  if (params.file.size > MAX_SIZE) {
    throw new Error("Файл превышает 20 МБ");
  }
  if (!ALLOWED_MIME.has(params.file.type)) {
    throw new Error("Разрешены JPG, PNG, WEBP, PDF");
  }

  const safeName = params.file.name.replace(/[^\w.-]+/g, "_");
  const path = `${userId}/${params.applicationId}/${params.docType}_${Date.now()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, params.file, {
      contentType: params.file.type,
      upsert: false,
    });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("business_legal_documents")
    .insert({
      application_id: params.applicationId,
      user_id: userId,
      doc_type: params.docType,
      storage_path: path,
      file_name: params.file.name,
      mime_type: params.file.type,
      size_bytes: params.file.size,
      ocr_data: params.ocrData ?? null,
    })
    .select("*")
    .single();
  if (error) {
    // откат файла, если запись в БД не прошла
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data as BizLegalDocument;
}

export async function getDocumentSignedUrl(storagePath: string, expiresInSec = 600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSec);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Cannot create signed url");
  return data.signedUrl;
}

export async function deleteDocument(doc: BizLegalDocument): Promise<void> {
  await supabase.storage.from(BUCKET).remove([doc.storage_path]).catch(() => {});
  const { error } = await supabase.from("business_legal_documents").delete().eq("id", doc.id);
  if (error) throw error;
}

// ─── Справочные данные ───────────────────────────────────
// Минимальный локальный справочник ОКВЭД для mock-режима (расширяется позже).
export const OKVED_CATALOG: Array<{ code: string; title: string }> = [
  { code: "47.91", title: "Розничная торговля по почте или в сети Интернет" },
  { code: "49.32", title: "Деятельность такси" },
  { code: "62.01", title: "Разработка компьютерного ПО" },
  { code: "63.11", title: "Обработка данных, хостинг" },
  { code: "68.20", title: "Аренда и управление собственным или арендованным недвижимым имуществом" },
  { code: "69.10", title: "Деятельность в области права" },
  { code: "69.20", title: "Деятельность в области бухучёта и аудита" },
  { code: "70.22", title: "Консультирование по вопросам коммерческой деятельности и управления" },
  { code: "73.11", title: "Деятельность рекламных агентств" },
  { code: "74.10", title: "Специализированная деятельность в области дизайна" },
  { code: "74.20", title: "Деятельность в области фотографии" },
  { code: "82.99", title: "Прочая вспомогательная деятельность для бизнеса" },
  { code: "85.41", title: "Образование дополнительное детей и взрослых" },
  { code: "86.90", title: "Прочая деятельность в области медицины" },
  { code: "93.13", title: "Деятельность фитнес-центров" },
  { code: "95.11", title: "Ремонт компьютеров и периферийного оборудования" },
  { code: "96.02", title: "Парикмахерские услуги" },
];

export const REQUIRED_DOCS_BY_KIND: Record<BizLegalKind, BizDocType[]> = {
  self_employed: ["passport_main"],
  entrepreneur: ["passport_main", "passport_registration", "inn_certificate", "payment_receipt"],
  legal_entity: [
    "passport_main",
    "passport_registration",
    "charter",
    "founder_decision",
    "address_proof",
    "payment_receipt",
  ],
};

export const DOC_TYPE_TITLES: Record<BizDocType, string> = {
  passport_main: "Паспорт (разворот)",
  passport_registration: "Паспорт (страница с пропиской)",
  inn_certificate: "ИНН",
  snils: "СНИЛС",
  application_form: "Заявление (Р21001/Р11001)",
  charter: "Устав ООО",
  founder_decision: "Решение учредителя",
  payment_receipt: "Квитанция об оплате госпошлины",
  address_proof: "Подтверждение адреса",
  other: "Другое",
};

export const STATUS_TITLES: Record<BizLegalStatus, string> = {
  draft: "Черновик",
  submitted: "Ожидает проверки",
  under_review: "На проверке",
  needs_fixes: "Требует исправлений",
  sent_to_fns: "Отправлено в ФНС",
  approved: "Одобрено / Зарегистрировано",
  rejected: "Отклонено",
};

export const KIND_TITLES: Record<BizLegalKind, string> = {
  self_employed: "Самозанятый",
  entrepreneur: "ИП",
  legal_entity: "Юр. лицо (ООО)",
};

// ─── Mock-симуляции платёжки и ФНС ───────────────────────
export async function mockCreatePayment(applicationId: string, amountRub: number): Promise<{ paymentId: string }> {
  const paymentId = `YK-MOCK-${applicationId.slice(0, 8)}-${Date.now()}`;
  await supabase
    .from("business_legal_applications")
    .update({ payment_status: "pending", payment_reference: paymentId })
    .eq("id", applicationId);
  // имитация успешного платежа через 500мс
  setTimeout(() => {
    void supabase
      .from("business_legal_applications")
      .update({ payment_status: "paid" })
      .eq("id", applicationId);
  }, 500);
  void amountRub;
  return { paymentId };
}
