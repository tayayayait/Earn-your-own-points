import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { ImageUp, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import {
  brandSettingsToForm,
  buildSaveBrandSettingsRpcArgs,
  defaultBrandSettingsForm,
  getContrastRatio,
  normalizeAdminSettingsResponse,
  validateBrandSettingsForm,
  validateLogoFileMeta,
  type AdminSettingsData,
  type BrandSettingsForm,
  type SaveBrandSettingsRpcArgs,
} from "@/features/admin-settings/settings-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
type BrandRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_brand_settings", args?: Record<string, never>): RpcResponse<unknown>;
  rpc(fn: "save_admin_brand_settings", args: SaveBrandSettingsRpcArgs): RpcResponse<unknown>;
};

const brandClient = supabase as unknown as BrandRpcClient;
const queryKey = ["admin-brand-settings"] as const;

export const Route = createFileRoute("/_authenticated/admin/settings/brand")({
  head: () => ({ meta: [{ title: "브랜드 설정 · 관리자" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BrandSettingsForm>(defaultBrandSettingsForm);
  const [formError, setFormError] = useState<string | null>(null);

  const brandQuery = useQuery({
    queryKey,
    queryFn: fetchBrandSettings,
  });

  useEffect(() => {
    if (brandQuery.data) {
      setForm(brandSettingsToForm(brandQuery.data.brand));
    }
  }, [brandQuery.data]);

  const saveMutation = useMutation({
    mutationFn: saveBrandSettings,
    onSuccess: (brand) => {
      queryClient.setQueryData(queryKey, brand);
      setForm(brandSettingsToForm(brand.brand));
      setFormError(null);
      toast.success("브랜드 설정이 저장되었습니다.");
    },
    onError: (error) => setFormError(error.message),
  });

  function updateForm(patch: Partial<BrandSettingsForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;

    const validationError = validateLogoFileMeta(file);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const logoUrl = await readFileAsDataUrl(file);
    updateForm({ logoUrl });
    setFormError(null);
  }

  function submit() {
    const validationError = validateBrandSettingsForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    saveMutation.mutate(form);
  }

  const contrastRatio = getContrastRatio(form.primaryColor, "#FFFFFF");

  if (brandQuery.isLoading) {
    return <div className="h-[560px] rounded-lg border border-[var(--color-slate-200)] bg-white" />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">브랜드 설정</h1>
        <p className="mt-1 text-sm text-[var(--color-slate-500)]">
          서비스명, 포인트 명칭, 로고 업로드, 색상, 사용자 홈 안내문을 관리합니다.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <AppInput
              label="서비스명"
              value={form.serviceName}
              onChange={(event) => updateForm({ serviceName: event.target.value })}
              maxLength={30}
            />
            <AppInput
              label="포인트 명칭"
              value={form.pointLabel}
              onChange={(event) => updateForm({ pointLabel: event.target.value })}
              maxLength={12}
            />
            <AppInput
              label="대표 색상"
              value={form.primaryColor}
              onChange={(event) => updateForm({ primaryColor: event.target.value })}
              placeholder="#2563EB"
            />
            <AppInput
              label="보조 색상"
              value={form.secondaryColor}
              onChange={(event) => updateForm({ secondaryColor: event.target.value })}
              placeholder="#10B981"
            />
          </div>

          <div className="mt-4 rounded-lg border border-[var(--color-slate-200)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-[var(--color-slate-900)]">로고 업로드</div>
                <div className="mt-1 text-xs text-[var(--color-slate-500)]">
                  SVG/PNG/WebP 형식, 최대 2MB
                </div>
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--color-slate-200)] bg-white px-4 text-sm font-semibold text-[var(--color-slate-700)] shadow-sm hover:bg-[var(--color-slate-50)]">
                <ImageUp className="size-4" aria-hidden="true" />
                파일 선택
                <input
                  type="file"
                  accept="image/svg+xml,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => void handleLogoUpload(event.target.files?.[0])}
                />
              </label>
            </div>
            {form.logoUrl && (
              <div className="mt-4 flex items-center gap-3">
                <img
                  src={form.logoUrl}
                  alt="브랜드 로고 미리보기"
                  className="size-14 rounded-md border border-[var(--color-slate-200)] object-contain"
                />
                <div className="min-w-0 truncate text-xs text-[var(--color-slate-500)]">
                  로고가 선택되었습니다.
                </div>
              </div>
            )}
          </div>

          <AppInput
            containerClassName="mt-4"
            label="사용자 홈 안내문"
            value={form.homeMessage}
            onChange={(event) => updateForm({ homeMessage: event.target.value })}
            maxLength={100}
            placeholder="오늘도 포인트를 확인하세요"
          />
          <AppInput
            containerClassName="mt-4"
            label="감사 사유"
            value={form.reason}
            onChange={(event) => updateForm({ reason: event.target.value })}
            placeholder="브랜드 설정 변경 사유"
          />

          {formError && (
            <div className="mt-4 rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-3 text-sm font-semibold text-[var(--color-error-text)]">
              {formError}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <AppButton
              type="button"
              onClick={submit}
              loading={saveMutation.isPending}
              loadingLabel="저장 중"
            >
              <Save className="size-4" aria-hidden="true" />
              저장
            </AppButton>
          </div>
        </div>

        <aside className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-[var(--color-slate-900)]">미리보기</h2>
          <div
            className="mt-4 rounded-lg p-5 text-white"
            style={{ backgroundColor: form.primaryColor }}
          >
            <div className="text-xl font-bold">{form.serviceName || "서비스명"}</div>
            <div className="mt-3 text-3xl font-bold tabular-nums">
              12,340{form.pointLabel || "P"}
            </div>
            <div className="mt-2 text-sm">{form.homeMessage || "사용자 홈 안내문"}</div>
          </div>
          <div className="mt-4 rounded-lg border border-[var(--color-slate-200)] p-3 text-sm">
            <div className="font-bold text-[var(--color-slate-900)]">WCAG 대비 검사</div>
            <div className="mt-1 text-[var(--color-slate-500)]">
              흰색 텍스트 대비 {contrastRatio}:1
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

async function fetchBrandSettings(): Promise<AdminSettingsData> {
  const { data, error } = await brandClient.rpc("get_admin_brand_settings", {});

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeAdminSettingsResponse({ brand: data as Record<string, unknown> });
}

async function saveBrandSettings(form: BrandSettingsForm): Promise<AdminSettingsData> {
  const { data, error } = await brandClient.rpc(
    "save_admin_brand_settings",
    buildSaveBrandSettingsRpcArgs(form),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeAdminSettingsResponse({ brand: data as Record<string, unknown> });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("로고 파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}
