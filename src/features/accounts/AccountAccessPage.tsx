import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { Badge, Button, Card } from "../../components/ui/primitives";
import { isAccountRole, type AccountRole } from "./roles";

export default function AccountAccessPage() {
  const [role, setRole] = useState<AccountRole | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void apiRequest<{ role: unknown }>("/api/account/role")
      .then(({ role: accountRole }) => {
        if (!isAccountRole(accountRole)) throw new Error("The server returned an unknown account role.");
        if (active) setRole(accountRole);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load this account's role.");
      });
    return () => { active = false; };
  }, []);

  return (
    <main className="account-access-page">
      <div className="account-access-heading">
        <span className="eyebrow">ACCOUNT ACCESS</span>
        <h1>Your account role</h1>
        <p>AliMind separates participant accounts from authorized reviewer accounts.</p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!error && role === null && (
        <Card className="account-role-card" role="status">
          <LoaderCircle size={18} className="auth-spinner" /> Checking your assigned role…
        </Card>
      )}
      {role && (
        <>
          <Card className="account-role-card">
            <div className="account-role-icon">{role === "reviewer" ? <ShieldCheck size={22} /> : <UserRound size={22} />}</div>
            <div className="account-role-copy">
              <span className="eyebrow">CURRENT ROLE</span>
              <h2>{role === "reviewer" ? "Human reviewer" : "Participant"}</h2>
              <p>{role === "reviewer"
                ? "This account is authorized to open the reviewer workspace."
                : "This account can complete and view its own reflections. Reviewer tools are not available."}</p>
            </div>
            <Badge className={`account-role-badge role-${role}`}>{role}</Badge>
          </Card>
          <section className="account-role-explainer" aria-label="Account role definitions">
            <Card>
              <UserRound size={18} />
              <h2>Participant</h2>
              <p>Can use the participant experience and access only their own account data. Participant accounts cannot grant themselves reviewer access.</p>
            </Card>
            <Card>
              <ShieldCheck size={18} />
              <h2>Reviewer</h2>
              <p>Authorized human reviewers can access the separate review workspace. AI tools may propose scores only; reviewers own decisions and participant-facing writing.</p>
            </Card>
          </section>
          {role === "reviewer" && (
            <Link to="/reviewer" className="button button-dark account-reviewer-link">
              Open reviewer workspace <ArrowRight size={16} />
            </Link>
          )}
          <p className="account-role-security-note">
            Roles are assigned by an authorized project administrator. They cannot be changed from this page.
            The reviewer workspace currently displays sample content only; it is not connected to real review cases.
          </p>
        </>
      )}
    </main>
  );
}
