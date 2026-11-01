import { Suspense, lazy, type ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../lib/auth/AuthProvider";
import { NAV, hasAnyRole } from "../lib/permissions";
import { Button } from "./components/ui/button";
import { ThemeProvider } from "../theme/ThemeProvider";
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
const Staff = lazy(() => import("./pages/staff/Staff"));
const Fees = lazy(() => import("./pages/fees/Fees"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
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
  if (status === "signedOut") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (status === "deactivated") return <Deactivated />;
  // A temporary password must be replaced before anything else.
  if (mustChangePassword && location.pathname !== "/change-password") return <Navigate to="/change-password" replace />;
  return children;
}

// Role decides what the person may do; their switched-on sections can only narrow that.
function RequireRole({ allowed, module, children }: { allowed: string[]; module?: string; children: ReactElement }) {
  const { roles, profile } = useAuth();
  const modules = profile?.modules ?? null;
  const moduleOn = !module || module === "dashboard" || modules === null || modules.includes(module);
  return hasAnyRole(roles, allowed as never) && moduleOn ? children : <Navigate to="/" replace />;
}

// Themed with the school's brand colour once the profile is known.
function Themed({ children }: { children: ReactElement }) {
  const { profile } = useAuth();
  return (
    <ThemeProvider
      userId={profile?.id}
      cloudTheme={profile?.theme}
      accent={profile?.brandPrimary}
    >
      {children}
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
                        <RequireRole allowed={item.roles} module={item.id}>
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
                          ) : item.id === "staff" ? (
                            <Staff />
                          ) : item.id === "fees" ? (
                            <Fees />
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
                      <RequireRole allowed={["school_admin"]} module="users">
                        <NewUserPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/users/:id"
                    element={
                      <RequireRole allowed={["school_admin"]} module="users">
                        <UserPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/students/new"
                    element={
                      <RequireRole allowed={["school_admin", "receptionist"]}>
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
