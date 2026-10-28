import { AuthShell } from "@/components/auth-shell";

/**
 * A survey link that doesn't match one. The people who follow these are
 * families and clients, who have no account — the site-wide page's "My
 * dashboard" button means nothing to them, so this one just says what
 * happened and thanks them.
 */
export default function SurveyNotFound() {
  return (
    <AuthShell
      title="This feedback link isn't working"
      description="It may have been copied only in part, or the survey may have been taken down. If you were asked for feedback, the care service that sent it can give you a new link."
    >
      <p className="text-sm text-muted-foreground">Thank you for taking the time.</p>
    </AuthShell>
  );
}
