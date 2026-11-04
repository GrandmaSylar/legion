import { Suspense, lazy, useEffect, type ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../lib/auth/AuthProvider";
import { useCapabilities } from "../lib/access/useCapabilities";
import { useFeatures } from "../lib/access/useFeatures";
import { NAV, hasAnyRole } from "../lib/permissions";
import { Button } from "./components/ui/button";
import { ThemeProvider } from "../theme/ThemeProvider";
import {
  hydratePersistedQueryCache,
  subscribeQueryCachePersistence,
} from "../lib/queryPersistence";
import { ActionDialogProvider } from "./components/modals";
import { Shell } from "./layout/Shell";
import ComingSoon from "./pages/ComingSoon";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Users = lazy(() => import("./pages/users/Users"));
const UserPage = lazy(() => import("./pages/users/UserForm"));
const NewUserPage = lazy(() => import("./pages/users/UserForm").then((m) => ({ default: m.NewUserPage })));
const StudentsList = lazy(() => import("./pages/students/StudentsList"));
const AddStudent = lazy(() => import("./pages/students/AddStudent"));
const StudentDetail = lazy(() => import("./pages/students/StudentDetail"));
const Attendance = lazy(() => import("./pages/attendance/Attendance"));
const Grades = lazy(() => import("./pages/grades/Grades"));
const Notices = lazy(() => import("./pages/notices/Notices"));
const Calendar = lazy(() => import("./pages/calendar/Calendar"));
const Tasks = lazy(() => import("./pages/tasks/Tasks"));
const LessonPlans = lazy(() => import("./pages/lessons/LessonPlans"));
const ClockIn = lazy(() => import("./pages/clockin/ClockIn"));
const Complaints = lazy(() => import("./pages/complaints/Complaints"));
const Staff = lazy(() => import("./pages/staff/Staff"));
const Fees = lazy(() => import("./pages/fees/Fees"));
const Analytics = lazy(() => import("./pages/analytics/Analytics"));
const Messages = lazy(() => import("./pages/messages/Messages"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 2 * 60_000,
      gcTime: 30 * 60_000,
    },
  },
});

function Splash() {
  return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Loading</div>;
}

function Deactivated() {
  const { signOut } = useAuth();
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <section className="surface max-w-sm space-y-3 p-6" role="alert">
        <h1 className="text-xl font-semibold">Account deactivated</h1>
        <p className="text-sm text-muted-foreground">
          This account can no longer be used. If you think that is a mistake, contact the school office.
        </p>
        <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
      </section>
    </main>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { status, mustChangePassword } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "signedOut") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (status === "deactivated") return <Deactivated />;
  // A temporary password must be replaced before anything else.
  if (mustChangePassword && location.pathname !== "/change-password") return <Navigate to="/change-password" replace />;
  return children;
}

// Role decides what the person may do; their switched-on sections can only narrow that.
function RequireRole({ allowed, module, anyAction, portalRoles, feature, children }: { allowed: string[]; module?: string; anyAction?: string[]; portalRoles?: string[]; feature?: string; children: ReactElement }) {
  const { roles, profile } = useAuth();
  const { isOn } = useFeatures();
  const { caps, isLoading } = useCapabilities();
  // A feature the school has switched off is closed to everyone, portal accounts included.
  // (Decided here, after every hook has run, so the number of hooks never changes between renders.)
  const featureOff = !!feature && !isOn(feature);
  const modules = profile?.modules ?? null;
  const moduleOn = !module || module === "dashboard" || modules === null || modules.includes(module);
  // A module decided by actions opens for anyone holding one of them; the rest still follow the role.
  if (featureOff) return <Navigate to="/" replace />;
  if (anyAction) {
    // Parents and students are portal accounts: they get in by role, staff by action.
    if (portalRoles && hasAnyRole(roles, portalRoles as never) && moduleOn) return children;
    if (isLoading) return <Splash />;
    return moduleOn && !!caps && anyAction.some((a) => caps.includes(a)) ? children : <Navigate to="/" replace />;
  }
  return hasAnyRole(roles, allowed as never) && moduleOn ? children : <Navigate to="/" replace />;
}

// Themed with the school's brand colour once the profile is known.
function Themed({ children }: { children: ReactElement }) {
  const { profile } = useAuth();
  hydratePersistedQueryCache(queryClient, profile?.id);
  useEffect(() => {
    return subscribeQueryCachePersistence(queryClient, profile?.id);
  }, [profile?.id]);
  return (
    <ThemeProvider
      userId={profile?.id}
      cloudTheme={profile?.theme}
      accent={profile?.brandPrimary}
    >
      <ActionDialogProvider>{children}</ActionDialogProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Themed>
          <BrowserRouter>
            <Suspense fallback={<Splash />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
                <Route
                  element={
                    <RequireAuth>
                      <Shell />
                    </RequireAuth>
                  }
                >
                  {NAV.map((item) => (
                    <Route
                      key={item.id}
                      path={item.path}
                      element={
                        <RequireRole allowed={item.roles} module={item.id} anyAction={item.anyAction} portalRoles={item.portalRoles} feature={item.feature}>
                          {item.id === "dashboard" ? (
                            <Dashboard />
                          ) : item.id === "settings" ? (
                            <Settings />
                          ) : item.id === "students" ? (
                            <StudentsList />
                          ) : item.id === "attendance" ? (
                            <Attendance />
                          ) : item.id === "grades" ? (
                            <Grades />
                          ) : item.id === "notices" ? (
                            <Notices />
                          ) : item.id === "calendar" ? (
                            <Calendar />
                          ) : item.id === "tasks" ? (
                            <Tasks />
                          ) : item.id === "lessons" ? (
                            <LessonPlans />
                          ) : item.id === "clockin" ? (
                            <ClockIn />
                          ) : item.id === "complaints" ? (
                            <Complaints />
                          ) : item.id === "staff" ? (
                            <Staff />
                          ) : item.id === "fees" ? (
                            <Fees />
                          ) : item.id === "messages" ? (
                            <Messages />
                          ) : item.id === "analytics" ? (
                            <Analytics />
                          ) : item.id === "users" ? (
                            <Users />
                          ) : (
                            <ComingSoon title={item.label} />
                          )}
                        </RequireRole>
                      }
                    />
                  ))}
                  <Route
                    path="/users/new"
                    element={
                      <RequireRole allowed={["school_admin"]} module="users" anyAction={["users.create"]}>
                        <NewUserPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/users/:id"
                    element={
                      <RequireRole allowed={["school_admin"]} module="users" anyAction={["users.view"]}>
                        <UserPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/students/new"
                    element={
                      <RequireRole allowed={["school_admin", "receptionist"]} anyAction={["students.create"]}>
                        <AddStudent />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/students/:id"
                    element={
                      <RequireRole allowed={["school_admin", "principal", "teacher", "receptionist", "accountant", "parent", "student"]}>
                        <StudentDetail />
                      </RequireRole>
                    }
                  />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </Themed>
      </AuthProvider>
    </QueryClientProvider>
  );
}
