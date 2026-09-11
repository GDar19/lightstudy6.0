import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/api/client";
import { Wizard, Logo } from "@/components/common";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login({ email, password });
      toast.success("С возвращением!");
      navigate(u.onboarded || u.role === "admin" ? "/app" : "/onboarding");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EE] flex flex-col">
      <div className="max-w-6xl w-full mx-auto px-5 h-16 flex items-center justify-between">
        <Logo />
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#4B5563] hover:text-[#1E2A4A]">
          <ArrowLeft className="w-4 h-4" /> На главную
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-6">
            <Wizard size={72} float />
            <h1 className="font-display text-2xl font-extrabold text-[#1E2A4A] mt-4">С возвращением!</h1>
            <p className="text-[#4B5563] text-sm mt-1">Войди, чтобы продолжить обучение</p>
          </div>
          <form onSubmit={submit} className="ls-card p-7 space-y-4" data-testid="login-form">
            <div>
              <label className="text-sm font-medium text-[#1E2A4A]">Email</label>
              <input
                data-testid="login-email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com"
                className="mt-1.5 w-full px-4 py-3 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] focus:border-[#B0862A] focus:ring-2 focus:ring-[#B0862A]/20 outline-none transition"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#1E2A4A]">Пароль</label>
              <div className="relative mt-1.5">
                <input
                  data-testid="login-password" type={show ? "text" : "password"} required value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-[#E5DEC9] bg-[#FAF8F3] focus:border-[#B0862A] focus:ring-2 focus:ring-[#B0862A]/20 outline-none transition"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A94A6]">
                  {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {error && <div data-testid="login-error" className="text-sm text-[#EF4444] bg-[#FEE2E2] px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={loading} data-testid="login-submit" className="btn-primary w-full disabled:opacity-60">
              {loading ? "Входим…" : "Войти"}
            </button>
            <p className="text-center text-sm text-[#4B5563]">
              Нет аккаунта? <Link to="/register" className="text-[#B0862A] font-semibold">Регистрация</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
