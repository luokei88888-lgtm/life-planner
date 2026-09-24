import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./AppContext";
import { AppShell } from "./layout/AppShell";
import { HomePage } from "../features/home/HomePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { AreasPage } from "../features/areas/AreasPage";
import { GoalsPage } from "../features/goals/GoalsPage";
import { WeekPage } from "../features/week/WeekPage";
import { HabitsPage } from "../features/habits/HabitsPage";
import { HabitDetailPage } from "../features/habits/HabitDetailPage";
import { ReviewsPage } from "../features/reviews/ReviewsPage";
import { WeeklyReviewPage } from "../features/reviews/WeeklyReviewPage";
import { MonthlyReviewPage } from "../features/reviews/MonthlyReviewPage";
import { YearlyReviewPage } from "../features/reviews/YearlyReviewPage";
import { NotesPage } from "../features/notes/NotesPage";
import { OnboardingPage, SKIP_ONBOARDING_KEY } from "../features/onboarding/OnboardingPage";
import { PlainFields } from "../ui/plainFields";

function FirstRunGuard() {
  const { settings } = useApp();
  const location = useLocation();
  const skipped = sessionStorage.getItem(SKIP_ONBOARDING_KEY) === "1";
  if (!settings.onboarded && !skipped && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}

export function App() {
  return (
    <AppProvider>
      <PlainFields />
      <HashRouter>
        <Routes>
          <Route element={<FirstRunGuard />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/areas" element={<AreasPage />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/week" element={<WeekPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/habits/:id" element={<HabitDetailPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/reviews/weekly/:weekStart" element={<WeeklyReviewPage />} />
              <Route path="/reviews/monthly/:month" element={<MonthlyReviewPage />} />
              <Route path="/reviews/yearly/:year" element={<YearlyReviewPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
