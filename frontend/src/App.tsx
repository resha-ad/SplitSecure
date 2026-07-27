import { Navigate, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { PasswordExpiredBanner } from "./components/PasswordExpiredBanner";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TotpVerifyPage } from "./pages/TotpVerifyPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { ProfilePage } from "./pages/ProfilePage";
import { GroupsPage } from "./pages/GroupsPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";

function App() {
  return (
    <>
      {/* Keyboard/screen-reader users can skip repeated navbar links on
          every page load - invisible until focused, per WCAG 2.4.1. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Navbar />
      <PasswordExpiredBanner />
      <main id="main-content">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/totp" element={<TotpVerifyPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/groups/:groupId" element={<GroupDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/groups" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
