import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAdminLoginLockoutState,
  registerAdminLoginFailure,
  type AdminLoginAttemptState,
} from "@/features/app-user/app-data";
import { supabase } from "@/integrations/supabase/client";

const baseAttemptState: AdminLoginAttemptState = {
  failures: 0,
  lockedUntil: null,
  updatedAt: 0,
};

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/admin/dashboard" });
  },
  head: () => ({ meta: [{ title: "관리자 로그인 · 포인트 리워드" }] }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const attemptState = useMemo(() => readAttemptState(email), [email]);
  const lockout = getAdminLoginLockoutState(attemptState);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const currentState = readAttemptState(normalizedEmail);
    const currentLockout = getAdminLoginLockoutState(currentState);

    if (currentLockout.locked) {
      toast.error(`로그인이 잠겼습니다. ${currentLockout.remainingSeconds}초 후 다시 시도하세요.`);
      return;
    }

    setLoading(true);
    try {
      localStorage.setItem("points.auth.remember", remember ? "true" : "false");
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (roleError || !roleData) {
        clearAttemptState(normalizedEmail);
        navigate({ to: "/admin/no-permission", search: { required: "관리자 권한" } });
        return;
      }

      clearAttemptState(normalizedEmail);
      toast.success("관리자로 로그인되었습니다.");
      navigate({ to: "/admin/dashboard" });
    } catch (error) {
      const nextState = registerAdminLoginFailure(currentState);
      writeAttemptState(normalizedEmail, nextState);
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function sendPasswordReset() {
    if (!email.trim()) {
      toast.error("비밀번호 재설정 이메일을 받을 주소를 입력하세요.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/admin/login`,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("비밀번호 재설정 링크를 전송했습니다.");
  }

  return (
    <div className="min-h-screen bg-[var(--color-slate-900)] px-4 py-10 text-white">
      <main className="mx-auto w-full max-w-md rounded-lg border border-white/10 bg-white p-6 text-[var(--color-slate-900)] shadow-xl">
        <header className="mb-6">
          <p className="text-sm font-bold text-[var(--color-primary-700)]">관리자</p>
          <h1 className="mt-1 text-2xl font-bold">관리자 로그인</h1>
        </header>

        {lockout.locked && (
          <div className="mb-4 rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-3 text-sm font-semibold text-[var(--color-error-text)]">
            5회 실패로 10분 잠금 상태입니다. {lockout.remainingSeconds}초 후 다시 시도하세요.
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="이메일"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <Field
            label="비밀번호"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <Checkbox checked={remember} onCheckedChange={(value) => setRemember(value === true)} />
            로그인 유지
          </label>
          <Button type="submit" className="min-h-11 w-full" disabled={loading || lockout.locked}>
            {loading ? "확인 중" : "관리자 로그인"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-5 min-h-11 text-sm font-bold text-[var(--color-primary-700)]"
          onClick={sendPasswordReset}
        >
          비밀번호 재설정
        </button>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  autoComplete: string;
}) {
  const id = `admin-login-${label}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
      />
    </div>
  );
}

function readAttemptState(email: string): AdminLoginAttemptState {
  if (typeof localStorage === "undefined" || !email.trim()) return baseAttemptState;

  try {
    const raw = localStorage.getItem(getAttemptStorageKey(email));
    return raw ? { ...baseAttemptState, ...JSON.parse(raw) } : baseAttemptState;
  } catch {
    return baseAttemptState;
  }
}

function writeAttemptState(email: string, state: AdminLoginAttemptState) {
  if (typeof localStorage === "undefined" || !email.trim()) return;
  localStorage.setItem(getAttemptStorageKey(email), JSON.stringify(state));
}

function clearAttemptState(email: string) {
  if (typeof localStorage === "undefined" || !email.trim()) return;
  localStorage.removeItem(getAttemptStorageKey(email));
}

function getAttemptStorageKey(email: string): string {
  return `points.admin.login.${email.trim().toLowerCase()}`;
}
