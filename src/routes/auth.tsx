import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatPhoneInput,
  validateSignupForm,
  type SignupForm,
} from "@/features/app-user/app-data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/app/home" });
  },
  head: () => ({
    meta: [
      { title: "로그인 · 포인트 리워드" },
      { name: "description", content: "포인트 리워드 계정으로 로그인하거나 가입하세요." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const form: SignupForm = {
          fullName,
          email,
          phone,
          password,
          termsAccepted,
          marketingOptIn,
        };
        const validationError = validateSignupForm(form);
        if (validationError) throw new Error(validationError);

        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone,
              marketing_opt_in: marketingOptIn,
              terms_accepted_at: new Date().toISOString(),
            },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("가입이 완료되었습니다. 이메일 확인이 필요한 경우 받은 편지함을 확인하세요.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        toast.success("로그인되었습니다.");
      }
      navigate({ to: "/" });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-slate-50)] px-4 py-10">
      <main className="mx-auto w-full max-w-md rounded-lg border border-[var(--color-slate-200)] bg-white p-6 shadow-sm">
        <header className="mb-6">
          <p className="text-sm font-bold text-[var(--color-primary-700)]">고객 계정</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-slate-900)]">
            {mode === "signin" ? "로그인" : "회원가입"}
          </h1>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <TextField label="이름" value={fullName} onChange={setFullName} autoComplete="name" />
          )}
          <TextField
            label="이메일"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          {mode === "signup" && (
            <TextField
              label="휴대폰"
              value={phone}
              onChange={(value) => setPhone(formatPhoneInput(value))}
              autoComplete="tel"
              inputMode="numeric"
              placeholder="010-0000-0000"
            />
          )}
          <TextField
            label="비밀번호"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />

          {mode === "signup" && (
            <div className="space-y-3 rounded-lg bg-[var(--color-slate-50)] p-3">
              <CheckboxRow
                label="필수 약관에 동의합니다."
                checked={termsAccepted}
                onCheckedChange={setTermsAccepted}
              />
              <CheckboxRow
                label="마케팅 수신에 동의합니다."
                checked={marketingOptIn}
                onCheckedChange={setMarketingOptIn}
              />
            </div>
          )}

          <Button type="submit" className="min-h-11 w-full" disabled={loading}>
            {loading ? "처리 중" : mode === "signin" ? "로그인" : "가입하기"}
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-3 text-center text-sm text-[var(--color-slate-500)]">
          {mode === "signin" ? (
            <button
              type="button"
              className="font-bold text-[var(--color-primary-700)]"
              onClick={() => setMode("signup")}
            >
              계정이 없으면 가입하기
            </button>
          ) : (
            <button
              type="button"
              className="font-bold text-[var(--color-primary-700)]"
              onClick={() => setMode("signin")}
            >
              이미 계정이 있으면 로그인
            </button>
          )}
          <Link to="/admin/login" className="font-semibold text-[var(--color-slate-700)]">
            관리자 로그인
          </Link>
        </div>
      </main>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  const id = `auth-${label}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        minLength={type === "password" ? 8 : undefined}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
      />
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[var(--color-slate-700)]">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      {label}
    </label>
  );
}
