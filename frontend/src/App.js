import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Loader } from "@/components/common";
import AppLayout from "@/components/AppLayout";

import Landing from "@/pages/Landing";
import About from "@/pages/About";
import Legal from "@/pages/Legal";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import StudyPlan from "@/pages/StudyPlan";
import Subjects from "@/pages/Subjects";
import SubjectDetail from "@/pages/SubjectDetail";
import TopicPage from "@/pages/TopicPage";
import LessonPage from "@/pages/LessonPage";
import Practice from "@/pages/Practice";
import MockExams from "@/pages/MockExams";
import Mistakes from "@/pages/Mistakes";
import Statistics from "@/pages/Statistics";
import Tutor from "@/pages/Tutor";
import Textbooks from "@/pages/Textbooks";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Diagnostic from "@/pages/Diagnostic";
import DiagnosticResults from "@/pages/DiagnosticResults";

function Protected({ children, requireOnboarded = true }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader full label="Загрузка LightStudy…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (requireOnboarded && !user.onboarded && user.role !== "admin")
    return <Navigate to="/onboarding" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader full />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

function Shell({ children }) {
  return <AppLayout>{children}</AppLayout>;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-center" richColors />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Legal type="privacy" />} />
            <Route path="/terms" element={<Legal type="terms" />} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/onboarding" element={<Protected requireOnboarded={false}><Onboarding /></Protected>} />

            <Route path="/app" element={<Protected><Shell><Dashboard /></Shell></Protected>} />
            <Route path="/app/plan" element={<Protected><Shell><StudyPlan /></Shell></Protected>} />
            <Route path="/app/subjects" element={<Protected><Shell><Subjects /></Shell></Protected>} />
            <Route path="/app/subjects/:id" element={<Protected><Shell><SubjectDetail /></Shell></Protected>} />
            <Route path="/app/topics/:id" element={<Protected><Shell><TopicPage /></Shell></Protected>} />
            <Route path="/app/lessons/:id" element={<Protected><Shell><LessonPage /></Shell></Protected>} />
            <Route path="/app/practice" element={<Protected><Shell><Practice /></Shell></Protected>} />
            <Route path="/app/mock-exams" element={<Protected><Shell><MockExams /></Shell></Protected>} />
            <Route path="/app/mistakes" element={<Protected><Shell><Mistakes /></Shell></Protected>} />
            <Route path="/app/statistics" element={<Protected><Shell><Statistics /></Shell></Protected>} />
            <Route path="/app/tutor" element={<Protected><Shell><Tutor /></Shell></Protected>} />
            <Route path="/app/textbooks" element={<Protected><Shell><Textbooks /></Shell></Protected>} />
            <Route path="/app/profile" element={<Protected><Shell><Profile /></Shell></Protected>} />
            <Route path="/app/admin" element={<Protected><Shell><Admin /></Shell></Protected>} />
            <Route path="/app/diagnostic/:subjectId" element={<Protected requireOnboarded={false}><Shell><Diagnostic /></Shell></Protected>} />
            <Route path="/app/diagnostic-results/:id" element={<Protected requireOnboarded={false}><Shell><DiagnosticResults /></Shell></Protected>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
