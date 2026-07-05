import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { Bell, KeyRound, Save, UserRound, UserX } from "lucide-react";
import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  buildProfileUpdateArgs,
  formatPhoneInput,
  getPublicAppProfileData,
  normalizeAppProfileResponse,
  validateAppPasswordForm,
  validateAppProfileForm,
  validateWithdrawalConfirmation,
  type AppPasswordForm,
  type AppProfileData,
  type AppProfileForm,
  type ProfileUpdateRpcArgs,
} from "@/features/app-user/app-data";
import { supabase } from "@/integrations/supabase/client";
import { hasActiveSession } from "@/lib/auth";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
type AppProfileRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_app_profile", args?: Record<string, never>): RpcResponse<unknown>;
  rpc(fn: "update_app_profile", args: ProfileUpdateRpcArgs): RpcResponse<unknown>;
  rpc(fn: "request_app_withdrawal", args: { _reason: string }): RpcResponse<unknown>;
};

const appProfileClient = supabase as unknown as AppProfileRpcClient;
const emptyProfileForm: AppProfileForm = {
  fullName: "",
  phone: "",
  email: "",
  pointEarnNotify: true,
  pointExpiryNotify: true,
  marketingOptIn: false,
};
const emptyPasswordForm: AppPasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "프로필 · 포인트 리워드" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const [profileForm, setProfileForm] = useState<AppProfileForm>(emptyProfileForm);
  const [passwordForm, setPasswordForm] = useState<AppPasswordForm>(emptyPasswordForm);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalText, setWithdrawalText] = useState("");

  const profileQuery = useQuery({
    queryKey: ["app-profile"],
    queryFn: fetchProfile,
  });

  useEffect(() => {
    if (profileQuery.data) {
      setProfileForm(profileQuery.data.form);
    }
  }, [profileQuery.data]);

  const profileMutation = useMutation({
    mutationFn: async (form: AppProfileForm) => {
      const validationError = validateAppProfileForm(form);
      if (validationError) throw new Error(validationError);

      const args = buildProfileUpdateArgs(form);
      if (!(await hasActiveSession())) return { publicAccess: true };

      const currentEmail = profileQuery.data?.form.email.trim().toLowerCase();
      if (currentEmail && currentEmail !== args._email) {
        const { error } = await supabase.auth.updateUser({ email: args._email });
        if (error) throw error;
      }

      await updateProfile(args);
      return { publicAccess: false };
    },
    onSuccess: (result) => {
      if (result.publicAccess) {
        toast.info("공개 보기에서는 변경사항이 저장되지 않습니다.");
      } else {
        toast.success("기본정보가 저장되었습니다.");
        void queryClient.invalidateQueries({ queryKey: ["app-profile"] });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const passwordMutation = useMutation({
    mutationFn: async (form: AppPasswordForm) => {
      const validationError = validateAppPasswordForm(form);
      if (validationError) throw new Error(validationError);
      if (!(await hasActiveSession())) {
        throw new Error("공개 보기에서는 비밀번호를 변경할 수 없습니다.");
      }

      const { error } = await supabase.auth.updateUser({
        password: form.newPassword,
        currentPassword: form.currentPassword,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("비밀번호가 변경되었습니다.");
      setPasswordForm(emptyPasswordForm);
    },
    onError: (error) => toast.error(error.message),
  });

  const withdrawalMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateWithdrawalConfirmation(withdrawalText);
      if (validationError) throw new Error(validationError);
      if (!(await hasActiveSession())) {
        throw new Error("공개 보기에서는 탈퇴 요청을 접수할 수 없습니다.");
      }
      return requestWithdrawal("사용자 탈퇴 요청");
    },
    onSuccess: () => {
      toast.success("탈퇴 요청이 접수되었습니다.");
      setWithdrawalOpen(false);
      setWithdrawalText("");
      void queryClient.invalidateQueries({ queryKey: ["app-profile"] });
    },
    onError: (error) => toast.error(error.message),
  });

  if (profileQuery.isLoading) {
    return <Skeleton className="h-[760px] rounded-lg bg-[var(--color-slate-200)]" />;
  }

  if (profileQuery.error) {
    return (
      <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
        <div className="font-semibold">프로필 정보를 불러오지 못했습니다.</div>
        <div className="mt-1">{profileQuery.error.message}</div>
      </section>
    );
  }

  const profile = profileQuery.data;
  if (!profile) return null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">프로필</h1>
      </header>

      <form
        className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          profileMutation.mutate(profileForm);
        }}
      >
        <SectionHeader icon={UserRound} title="기본정보 수정" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField
            label="이름"
            value={profileForm.fullName}
            onChange={(value) => setProfileForm((current) => ({ ...current, fullName: value }))}
          />
          <TextField
            label="휴대폰"
            value={profileForm.phone}
            onChange={(value) =>
              setProfileForm((current) => ({ ...current, phone: formatPhoneInput(value) }))
            }
            inputMode="numeric"
            placeholder="010-0000-0000"
          />
          <TextField
            label="이메일"
            value={profileForm.email}
            onChange={(value) => setProfileForm((current) => ({ ...current, email: value }))}
            type="email"
          />
        </div>

        <div className="mt-5 border-t border-[var(--color-slate-200)] pt-5">
          <SectionHeader icon={Bell} title="알림 설정" />
          <div className="mt-3 space-y-3">
            <SwitchRow
              label="포인트 적립 알림"
              checked={profileForm.pointEarnNotify}
              onCheckedChange={(checked) =>
                setProfileForm((current) => ({ ...current, pointEarnNotify: checked }))
              }
            />
            <SwitchRow
              label="만료 예정 알림"
              checked={profileForm.pointExpiryNotify}
              onCheckedChange={(checked) =>
                setProfileForm((current) => ({ ...current, pointExpiryNotify: checked }))
              }
            />
            <SwitchRow
              label="마케팅 수신"
              checked={profileForm.marketingOptIn}
              onCheckedChange={(checked) =>
                setProfileForm((current) => ({ ...current, marketingOptIn: checked }))
              }
            />
          </div>
        </div>

        <Button type="submit" className="mt-5 min-h-11" disabled={profileMutation.isPending}>
          <Save className="mr-2 size-4" aria-hidden="true" />
          {profileMutation.isPending ? "저장 중" : "저장"}
        </Button>
      </form>

      <form
        className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          passwordMutation.mutate(passwordForm);
        }}
      >
        <SectionHeader icon={KeyRound} title="비밀번호 변경" />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <TextField
            label="현재 비밀번호"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(value) =>
              setPasswordForm((current) => ({ ...current, currentPassword: value }))
            }
          />
          <TextField
            label="새 비밀번호"
            type="password"
            value={passwordForm.newPassword}
            onChange={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))}
          />
          <TextField
            label="새 비밀번호 확인"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(value) =>
              setPasswordForm((current) => ({ ...current, confirmPassword: value }))
            }
          />
        </div>
        <Button type="submit" className="mt-5 min-h-11" disabled={passwordMutation.isPending}>
          {passwordMutation.isPending ? "변경 중" : "비밀번호 변경"}
        </Button>
      </form>

      <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-white p-5 shadow-sm">
        <SectionHeader icon={UserX} title="탈퇴 요청" />
        <p className="mt-2 text-sm text-[var(--color-slate-600)]">
          잔여 포인트 {profile.balance.availableLabel}가 소멸될 수 있습니다. 탈퇴 요청은 감사 로그에
          기록됩니다.
        </p>
        <Button
          type="button"
          variant="destructive"
          className="mt-4 min-h-11"
          onClick={() => setWithdrawalOpen(true)}
          disabled={profile.status === "withdrawn"}
        >
          탈퇴 요청
        </Button>
      </section>

      <WithdrawalDialog
        open={withdrawalOpen}
        profile={profile}
        value={withdrawalText}
        pending={withdrawalMutation.isPending}
        onOpenChange={setWithdrawalOpen}
        onChange={setWithdrawalText}
        onConfirm={() => withdrawalMutation.mutate()}
      />
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof UserRound; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />
      <h2 className="text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  const id = `profile-${label}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-lg bg-[var(--color-slate-50)] px-3">
      <span className="text-sm font-semibold text-[var(--color-slate-700)]">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function WithdrawalDialog({
  open,
  profile,
  value,
  pending,
  onOpenChange,
  onChange,
  onConfirm,
}: {
  open: boolean;
  profile: AppProfileData;
  value: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>탈퇴 요청</DialogTitle>
          <DialogDescription>
            잔여 포인트 {profile.balance.availableLabel}가 남아 있습니다. 계속하려면 아래 입력란에
            "탈퇴"를 입력하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="withdrawal-confirm">확인 문구</Label>
          <Input
            id="withdrawal-confirm"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="탈퇴"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "요청 중" : "탈퇴 요청"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function fetchProfile(): Promise<AppProfileData> {
  if (!(await hasActiveSession())) return getPublicAppProfileData();

  const { data, error } = await appProfileClient.rpc("get_app_profile", {});

  if (error) {
    throw new Error(error.message);
  }

  return normalizeAppProfileResponse(data);
}

async function updateProfile(args: ProfileUpdateRpcArgs): Promise<unknown> {
  const { data, error } = await appProfileClient.rpc("update_app_profile", args);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function requestWithdrawal(reason: string): Promise<unknown> {
  const { data, error } = await appProfileClient.rpc("request_app_withdrawal", {
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
