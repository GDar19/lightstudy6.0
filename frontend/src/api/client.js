import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Build an absolute URL for a stored media asset. Accepts a full url ("/api/media/<id>") or a bare media_id.
export const mediaUrl = (ref) => {
  if (!ref) return "";
  if (ref.startsWith("http")) return ref;
  if (ref.startsWith("/api/")) return `${BACKEND_URL}${ref}`;
  return `${API}/media/${ref}`;
};

const client = axios.create({ baseURL: API, withCredentials: true });

// Auto-refresh access token once on 401 (except for auth endpoints)
let refreshing = null;
client.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    const url = original?.url || "";
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/register") || url.includes("/auth/refresh") || url.includes("/auth/me");
    if (error.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        refreshing = refreshing || client.post("/auth/refresh");
        await refreshing;
        refreshing = null;
        return client(original);
      } catch (e) {
        refreshing = null;
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Что-то пошло не так. Попробуй ещё раз.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const api = {
  // auth
  register: (d) => client.post("/auth/register", d),
  login: (d) => client.post("/auth/login", d),
  logout: () => client.post("/auth/logout"),
  me: () => client.get("/auth/me"),
  onboarding: (d) => client.post("/onboarding", d),
  updateProfile: (d) => client.patch("/profile", d),
  // content
  subjects: () => client.get("/subjects"),
  subject: (id) => client.get(`/subjects/${id}`),
  topic: (id) => client.get(`/topics/${id}`),
  lesson: (id) => client.get(`/lessons/${id}`),
  completeLesson: (id) => client.post(`/lessons/${id}/complete`),
  lessonTaskAnswer: (id, d) => client.post(`/lessons/${id}/task-answer`, d),
  lessonChat: (id) => client.get(`/lessons/${id}/chat`),
  lessonChatSend: (id, d) => client.post(`/lessons/${id}/chat`, d),
  textbooks: () => client.get("/textbooks"),
  // diagnostics
  startDiagnostic: (subject_id) => client.post("/diagnostics/start", { subject_id }),
  answerDiagnostic: (id, d) => client.post(`/diagnostics/${id}/answer`, d),
  finishDiagnostic: (id) => client.post(`/diagnostics/${id}/finish`),
  diagnosticResults: (id) => client.get(`/diagnostics/${id}/results`),
  myDiagnostics: () => client.get("/diagnostics"),
  // plan
  studyPlan: () => client.get("/study-plan"),
  generatePlan: () => client.post("/study-plan/generate"),
  patchPlanItem: (id, d) => client.patch(`/study-plan/items/${id}`, d),
  // practice
  startPractice: (d) => client.post("/practice/start", d),
  practiceAnswer: (d) => client.post("/practice/answer", d),
  finishPractice: (id) => client.post(`/practice/${id}/finish`),
  // part 2 (extended response)
  part2Tasks: (params) => client.get("/part2/tasks", { params }),
  part2Task: (id) => client.get(`/part2/tasks/${id}`),
  submitSolution: (id, formData) => client.post(`/part2/tasks/${id}/submit`, formData, { headers: { "Content-Type": "multipart/form-data" } }),
  part2Submissions: () => client.get("/part2/submissions"),
  // mistakes
  mistakes: () => client.get("/mistakes"),
  // dashboard/stats
  dashboard: () => client.get("/dashboard"),
  statistics: () => client.get("/statistics"),
  achievements: () => client.get("/achievements"),
  notifications: () => client.get("/notifications"),
  readAllNotifications: () => client.post("/notifications/read-all"),
  // ai
  aiStatus: () => client.get("/ai/status"),
  aiConversations: () => client.get("/ai/conversations"),
  aiConversation: (id) => client.get(`/ai/conversations/${id}`),
  aiClear: (id) => client.post(`/ai/conversations/${id}/clear`),
  aiChat: (d) => client.post("/ai/chat", d),
  aiExplain: (d) => client.post("/ai/explain", d),
  aiGenerateQuestion: (d) => client.post("/ai/generate-question", d),
  aiAnalyze: (d) => client.post("/ai/analyze-answer", d),
  // mock
  mockExams: () => client.get("/mock-exams"),
  startMock: (subject_id) => client.post("/mock-exams/start", { subject_id }),
  finishMock: (id, d) => client.post(`/mock-exams/${id}/finish`, d),
  mockResult: (id) => client.get(`/mock-exams/${id}`),
  // admin
  adminStats: () => client.get("/admin/stats"),
  adminUsers: () => client.get("/admin/users"),
  adminQuestions: (params) => client.get("/admin/questions", { params }),
  adminTopics: () => client.get("/admin/topics"),
  adminSubjectsAll: () => client.get("/admin/subjects"),
  toggleSubject: (id, enabled) => client.patch(`/admin/subjects/${id}`, { enabled }),
  adminUploadMedia: (formData) => client.post("/admin/media/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  uploadMedia: (formData) => client.post("/media/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  kbList: () => client.get("/admin/kb"),
  kbUpload: (formData) => client.post("/admin/kb/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  kbDelete: (id) => client.delete(`/admin/kb/${id}`),
  kbReprocess: (id) => client.post(`/admin/kb/${id}/reprocess`),
  kbSearch: (d) => client.post("/admin/kb/search", d),
  createQuestion: (d) => client.post("/admin/questions", d),
  updateQuestion: (id, d) => client.patch(`/admin/questions/${id}`, d),
  verifyQuestion: (id, verified) => client.patch(`/admin/questions/${id}/verify`, { verified }),
  setQuestionStatus: (id, status) => client.patch(`/admin/questions/${id}/status`, { status }),
  duplicateQuestion: (id) => client.post(`/admin/questions/${id}/duplicate`),
  questionStats: () => client.get("/admin/questions/stats"),
  deleteQuestion: (id) => client.delete(`/admin/questions/${id}`),
};

export default client;
