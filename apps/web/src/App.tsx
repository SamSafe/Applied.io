import { Redirect, Route, Switch, useLocation } from "wouter";
import { ApiError } from "./api";
import { ErrorBanner, Mark } from "./components/bits";
import { Shell } from "./components/Shell";
import { useMe } from "./hooks";
import { InsightsPage } from "./pages/Insights";
import { Pipeline } from "./pages/Pipeline";
import { ReviewPage } from "./pages/Review";
import { SettingsPage } from "./pages/Settings";
import { SignIn } from "./pages/SignIn";

export function App() {
  const me = useMe();
  const [location] = useLocation();

  if (me.isPending) return <Boot />;

  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return location === "/sign-in" ? <SignIn /> : <Redirect to="/sign-in" replace />;
    }
    return (
      <Boot>
        <ErrorBanner error={me.error} onRetry={() => me.refetch()} />
      </Boot>
    );
  }

  if (location === "/sign-in") return <Redirect to="/" replace />;

  const { user } = me.data;
  return (
    <Shell user={user}>
      <Switch>
        <Route path="/settings">
          <SettingsPage user={user} />
        </Route>
        <Route path="/review">
          <ReviewPage />
        </Route>
        <Route path="/insights">
          <InsightsPage />
        </Route>
        <Route>
          <Pipeline />
        </Route>
      </Switch>
    </Shell>
  );
}

function Boot({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <div className="shell-bar">
        <div className="shell-bar-inner">
          <span className="wordmark">
            <Mark />
            Applied
          </span>
        </div>
      </div>
      <main className="main">{children}</main>
    </>
  );
}
