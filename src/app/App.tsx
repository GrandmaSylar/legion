import { Suspense, lazy, type ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../lib/auth/AuthProvider";
import { NAV, hasAnyRole } from "../lib/permissions";
import { ThemeProvider } from "../theme/ThemeProvider";
import { Shell } from "./layout/Shell";
import ComingSoon from "./pages/ComingSoon";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
const StudentsList = lazy(() => import("./pages/students/StudentsList"));
const AddStudent = lazy(() => import("./pages/students/AddStudent"));
const StudentDetail = lazy(() => import("./pages/students/StudentDetail"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Splash() {
  return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Loading</div>;
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "signedOut") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function RequireRole({ allowed, children }: { allowed: string[]; children: ReactElement }) {
  const { roles } = useAuth();
  return hasAnyRole(roles, allowed as never) ? children : <Navigate to="/" replace />;
}

// Themed with the school's brand colour once the profile is known.
function Themed({ children }: { children: ReactElement }) {
  const { profile } = useAuth();
  return <ThemeProvider accent={profile?.brandPrimary}>{children}</ThemeProvider>;
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
                        <RequireRole allowed={item.roles}>
                          {item.id === "dashboard" ? (
                            <Dashboard />
                          ) : item.id === "settings" ? (
                            <Settings />
                          ) : item.id === "students" ? (
                            <StudentsList />
                          ) : (
                            <ComingSoon title={item.label} />
                          )}
                        </RequireRole>
                      }
                    />
                  ))}
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
