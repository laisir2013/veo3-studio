import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { ScrollToTop } from "./components/ScrollToTop";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import ErrorBoundary from "./components/ErrorBoundary";
import UpdatePrompt from "./components/UpdatePrompt";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import BatchGenerate from "./pages/BatchGenerate";
import Characters from "./pages/Characters";
import TaskProgress from "./pages/TaskProgress";
import History from "./pages/History";
import VideoEdit from "./pages/VideoEdit";
import WorkflowPage from "./pages/WorkflowPage";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={WorkflowPage} />
      <Route path="/classic" component={Home} />
      <Route path="/batch" component={BatchGenerate} />
      <Route path="/characters" component={Characters} />
      <Route path="/task/:id" component={TaskProgress} />
      <Route path="/history" component={History} />
      <Route path="/edit/:id" component={VideoEdit} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <ScrollToTop />
          <ScrollToTopButton />
          <UpdatePrompt onUpdate={() => console.log('[PWA] User triggered update')} />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
