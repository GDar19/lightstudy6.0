import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, CalendarDays, BookOpen, Dumbbell, ClipboardCheck,
  AlertTriangle, BarChart3, Sparkles, Library, Settings, LogOut, Menu, X,
  Bell, Shield,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Logo, Wizard } from "./common";
import { api } from "../api/client";

const NAV = [
  { to: "/app", icon: LayoutDashboard, label: "Главная", end: true, testId: "nav-dashboard" },
  { to: "/app/plan", icon: CalendarDays, label: "Мой план", testId: "nav-plan" },
  { to: "/app/subjects", icon: BookOpen, label: "Предметы", testId: "nav-subjects" },
  { to: "/app/practice", icon: Dumbbell, label: "Практика", testId: "nav-practice" },
  { to: "/app/mock-exams", icon: ClipboardCheck, label: "Пробники", testId: "nav-mock" },
  { to: "/app/mistakes", icon: AlertTriangle, label: "Ошибки", testId: "nav-mistakes" },
  { to: "/app/statistics", icon: BarChart3, label: "Статистика", testId: "nav-stats" },
  { to: "/app/tutor", icon: Sparkles, label: "ИИ-помощник", testId: "nav-tutor" },
  { to: "/app/textbooks", icon: Library, label: "Мои учебники", testId: "nav-textbooks" },
  { to: "/app/profile", icon: Settings, label: "Профиль", testId: "nav-profile" },
];

function NavItems({ onClick, isAdmin }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onClick}
          data-testid={item.testId}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? "bg-[#7C66DC] text-white shadow-md"
                : "text-[#B8C0D0] hover:text-white hover:bg-white/8"
            }`
          }
        >
          <item.icon className="w-[18px] h-[18px]" />
          {item.label}
        </NavLink>
      ))}
      {isAdmin && (
        <NavLink
          to="/app/admin"
          onClick={onClick}
          data-testid="nav-admin"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive ? "bg-[#7C66DC] text-white shadow-md" : "text-[#B8C0D0] hover:text-white hover:bg-white/8"
            }`
          }
        >
          <Shield className="w-[18px] h-[18px]" />
          Админ-панель
        </NavLink>
      )}
    </nav>
  );
}

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    api.notifications().then(({ data }) => setNotifs(data)).catch(() => {});
  }, []);

  const unread = notifs.filter((n) => !n.read).length;
  const isAdmin = user?.role === "admin";

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  const openNotifs = async () => {
    setShowNotifs((s) => !s);
    if (unread > 0) {
      await api.readAllNotifications();
      setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EE] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-[#182238] fixed inset-y-0 left-0 z-30">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <img src="/mascot.png" alt="LightStudy" className="w-9 h-9 rounded-xl object-cover" />
          <span className="font-display font-extrabold text-lg text-white">LightStudy</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavItems isAdmin={isAdmin} />
        </div>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-[#7C66DC] flex items-center justify-center text-white font-semibold text-sm">
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-[#8A94A6] truncate">{user?.email}</div>
            </div>
            <button onClick={doLogout} data-testid="logout-btn" className="text-[#B8C0D0] hover:text-white p-1.5 rounded-lg hover:bg-white/8">
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-[#182238] flex items-center justify-between px-4 h-14">
        <button onClick={() => setMobileOpen(true)} data-testid="mobile-menu-btn" className="text-white p-1.5">
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <img src="/mascot.png" alt="LightStudy" className="w-8 h-8 rounded-lg object-cover" />
          <span className="font-display font-extrabold text-white">LightStudy</span>
        </div>
        <button onClick={openNotifs} className="text-white p-1.5 relative" data-testid="notif-btn-mobile">
          <Bell className="w-5 h-5" />
          {unread > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#7C66DC] rounded-full" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-[#182238] flex flex-col animate-fade-up">
            <div className="px-5 py-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src="/mascot.png" alt="LightStudy" className="w-9 h-9 rounded-xl object-cover" />
                <span className="font-display font-extrabold text-lg text-white">LightStudy</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-white p-1"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <NavItems isAdmin={isAdmin} onClick={() => setMobileOpen(false)} />
            </div>
            <div className="p-3 border-t border-white/10">
              <button onClick={doLogout} className="flex items-center gap-3 px-3.5 py-2.5 text-[#B8C0D0] hover:text-white w-full">
                <LogOut className="w-[18px] h-[18px]" /> Выйти
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 min-w-0">
        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-end gap-3 px-8 h-16 border-b border-[#E5DEC9] bg-[#F8F5EE]/80 backdrop-blur sticky top-0 z-20">
          <div className="relative">
            <button onClick={openNotifs} data-testid="notif-btn" className="relative p-2 rounded-xl hover:bg-[#F0EBE1] text-[#4B5563]">
              <Bell className="w-5 h-5" />
              {unread > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#7C66DC] rounded-full" />}
            </button>
            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 ls-card p-2 z-50" data-testid="notif-panel">
                <div className="px-3 py-2 font-display font-semibold text-[#1E2A4A]">Уведомления</div>
                {notifs.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-[#8A94A6] text-center">Пока нет уведомлений</div>
                ) : (
                  notifs.slice(0, 8).map((n) => (
                    <div key={n.id} className="px-3 py-2.5 rounded-lg hover:bg-[#FAF8F3] text-sm text-[#4B5563]">
                      {n.text}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto pb-24">{children}</div>
      </main>
    </div>
  );
}
