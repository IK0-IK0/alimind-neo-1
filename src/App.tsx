import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AtSign,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  Heart,
  KeyRound,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sprout,
  UserRound,
  X,
} from "lucide-react";
import { QUESTIONS, type Question } from "./data/questionnaire";
import {
  calculateProfile,
  makeAnswer,
  shuffleQuestions,
  type Answer,
  type Profile,
} from "./features/assessment/scoring";
import {
  loadActiveAssessment,
  loadAssessmentDetail,
  loadAssessmentHistory,
  type AssessmentSessionDetail,
  type AssessmentSummary,
} from "./features/assessment/assessment-data";
import {
  PILOT_ADDITIONAL_QUESTIONS,
  PILOT_TTM_QUESTIONS,
  type PilotAdditionalQuestion,
  type PilotTtmQuestion,
} from "./data/pilot-survey-questions";
import { classifyTtmStage, createTtmAnswersFromResponses } from "./features/pipeline/ttm";
import { getStageDescription } from "./features/coaching/coaching";
import PipelineLabPage from "./features/pipeline/PipelineLabPage";
import AccountAccessPage from "./features/accounts/AccountAccessPage";
import ReviewerWorkspacePage from "./features/reviewer/ReviewerWorkspacePage";
import { AuroraBackground } from "./components/AuroraBackground";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Progress,
} from "./components/ui/primitives";
import { useAuth } from "./auth/AuthProvider";
import { getAuthClient, getSupabaseClient } from "./auth/client";
import { apiRequest } from "./lib/api";

type ChatMessage = { id: number; sender: "bot" | "user"; text: string };
type LiveQuestion = Question | PilotTtmQuestion | PilotAdditionalQuestion;
type AutomatedScoringTestResult = {
  profile: Profile;
  answers: Answer[];
  messages: ChatMessage[];
  questions: LiveQuestion[];
  counts: {
    tpbScored: number;
    tpbTotal: number;
    intentionScored: number;
    intentionTotal: number;
  };
};

function createAutomatedScoringTestMessages(
  questions: LiveQuestion[],
  answers: Answer[],
): ChatMessage[] {
  const answersById = new Map(answers.map((answer) => [answer.questionId, answer]));
  const messages: ChatMessage[] = [{
    id: 0,
    sender: "bot",
    text: "This is a synthetic automated test. The answers and scores will be saved and submitted for human review.",
  }];
  let messageId = 1;
  for (const question of questions) {
    const answer = answersById.get(question.id);
    if (!answer?.response) {
      throw new Error(`The automated test did not return an answer for question ${question.id}.`);
    }
    messages.push({ id: messageId++, sender: "bot", text: question.prompt });
    messages.push({ id: messageId++, sender: "user", text: answer.response });
  }
  messages.push({
    id: messageId,
    sender: "bot",
    text: "The automated run is complete and saved in the reviewer queue.",
  });
  return messages;
}

function Brand({ inverse = false, to = "/" }: { inverse?: boolean; to?: string }) {
  return (
    <Link className={`brand${inverse ? " brand-inverse" : ""}`} to={to} aria-label="AliMind home">
      <span className="brand-icon"><Sprout size={19} strokeWidth={2.2} /></span>
      <span>ali<span className="brand-highlight">mind</span></span>
    </Link>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isPending, refresh, error: sessionError } = useAuth();
  const isDemo = location.pathname === "/demo";
  const isDashboard = location.pathname === "/dashboard";
  const isLandingPage = location.pathname === "/";
  const profileLabel = user
    ? (typeof user.user_metadata.name === "string" && user.user_metadata.name.trim()) || user.email?.split("@")[0] || "Your profile"
    : "";
  const profileInitials = profileLabel.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => {
    if (!profileMenuOpen) return;
    function dismissMenu(event: Event) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setProfileMenuOpen(false);
        return;
      }
      if (event instanceof PointerEvent && event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismissMenu);
    document.addEventListener("keydown", dismissMenu);
    return () => {
      document.removeEventListener("pointerdown", dismissMenu);
      document.removeEventListener("keydown", dismissMenu);
    };
  }, [profileMenuOpen]);

  async function signOut() {
    try {
      const { error } = await getAuthClient().signOut();
      if (error) throw error;
      await refresh();
      navigate("/");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Couldn't sign out. Please try again.");
    }
  }
  return (
    <header className={`site-header${isDemo ? " demo-header" : ""}`}>
      <div className="header-inner">
        <Brand to={user ? "/dashboard" : "/"} />
        {!isPending && <Button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </Button>}
        {!isPending && <nav className={`main-nav${menuOpen ? " nav-open" : ""}`} aria-label="Main navigation">
          {user
            ? <>
                <Link to="/dashboard" className={isDashboard ? "nav-current" : ""} aria-current={isDashboard ? "page" : undefined} onClick={() => setMenuOpen(false)}>Dashboard</Link>
                <div className="profile-menu-wrap" ref={profileMenuRef}>
                  <Button
                    className="profile-menu-trigger"
                    variant="ghost"
                    aria-label={`Open profile menu for ${profileLabel}`}
                    aria-haspopup="menu"
                    aria-expanded={profileMenuOpen}
                    onClick={() => { setMenuOpen(false); setProfileMenuOpen((open) => !open); }}
                  >
                    <span className="profile-menu-avatar">{profileInitials || <UserRound size={16} />}</span>
                    <span className="profile-menu-trigger-label">Profile</span>
                    <ChevronDown size={15} className={profileMenuOpen ? "profile-menu-chevron profile-menu-chevron-open" : "profile-menu-chevron"} />
                  </Button>
                  {profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Profile menu">
                    <div className="profile-menu-identity">
                      <strong>{profileLabel}</strong>
                      <span>{user.email}</span>
                    </div>
                    <Button className="profile-menu-item" variant="ghost" role="menuitem" onClick={() => { setProfileMenuOpen(false); setSettingsOpen(true); }}>
                      <Settings size={16} /> Settings
                    </Button>
                    <Link className="profile-menu-item ui-button" role="menuitem" to="/account" onClick={() => setProfileMenuOpen(false)}>
                      <ShieldCheck size={16} /> Account access
                    </Link>
                    <Button className="profile-menu-item profile-menu-signout" variant="ghost" role="menuitem" onClick={() => { setProfileMenuOpen(false); void signOut(); }}>
                      <LogOut size={16} /> Sign out
                    </Button>
                  </div>}
                </div>
              </>
            : <>
                {isLandingPage && <>
                  <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
                  <a href="#about" onClick={() => setMenuOpen(false)}>Our approach</a>
                </>}
                <Link to="/demo" className={isDemo ? "nav-demo-current" : ""} onClick={() => setMenuOpen(false)}>Try the demo</Link>
                <Link to="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
                {isLandingPage && <Link className="button button-small button-dark nav-cta" to="/register" onClick={() => setMenuOpen(false)}>Create account <ArrowUpRight size={15} /></Link>}
              </>}
        </nav>}
        {(authError || sessionError) && <p className="header-auth-error" role="alert">{authError || sessionError}</p>}
      </div>
      {user && <ProfileSettingsDialog user={user} open={settingsOpen} onOpenChange={setSettingsOpen} onUserUpdated={refresh} />}
    </header>
  );
}

function ProfileSettingsDialog({
  user,
  open,
  onOpenChange,
  onUserUpdated,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDisplayName(typeof user.user_metadata.name === "string" ? user.user_metadata.name : "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setProfileError("");
    setPasswordError("");
    setProfileSaved(false);
    setPasswordSaved(false);
  }, [open, user.id, user.user_metadata.name]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = displayName.trim();
    if (!nextName) {
      setProfileError("Enter a name to save.");
      return;
    }
    setProfileBusy(true);
    setProfileError("");
    setProfileSaved(false);
    try {
      const { error } = await getAuthClient().updateUser({ data: { name: nextName } });
      if (error) throw error;
      await onUserUpdated();
      setProfileSaved(true);
    } catch (requestError) {
      setProfileError(requestError instanceof Error ? requestError.message : "Could not update your profile. Try again.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords don’t match.");
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError("Use at least 10 characters for your new password.");
      return;
    }
    if (!user.email) {
      setPasswordError("This account has no email address available for verification.");
      return;
    }
    setPasswordBusy(true);
    setPasswordError("");
    setPasswordSaved(false);
    try {
      const { error: verifyError } = await getAuthClient().signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error("Current password is incorrect.");
      const { error: updateError } = await getAuthClient().updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await onUserUpdated();
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setPasswordError(requestError instanceof Error ? requestError.message : "Could not update your password. Try again.");
    } finally {
      setPasswordBusy(false);
      setCurrentPassword("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <DialogContent className="account-settings-dialog">
        <span className="account-settings-icon"><Settings size={19} /></span>
        <span className="eyebrow">YOUR ACCOUNT</span>
        <DialogTitle>Profile settings</DialogTitle>
        <DialogDescription>Keep your profile up to date and manage your sign-in password.</DialogDescription>
        <form className="settings-form" onSubmit={(event) => void saveProfile(event)}>
          <div className="settings-section-heading"><UserRound size={16} /><strong>Profile</strong></div>
          <label htmlFor="settings-display-name">Display name</label>
          <Input id="settings-display-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required disabled={profileBusy} />
          <label htmlFor="settings-email">Email address</label>
          <div className="settings-readonly-field"><AtSign size={15} /><Input id="settings-email" value={user.email ?? ""} readOnly aria-describedby="settings-email-note" /></div>
          <small id="settings-email-note" className="settings-hint">Email changes aren’t available in AliMind settings.</small>
          {profileError && <p className="form-error" role="alert">{profileError}</p>}
          {profileSaved && <p className="settings-success" role="status"><Check size={14} /> Profile updated.</p>}
          <Button type="submit" className="button button-dark settings-submit" disabled={profileBusy || !displayName.trim()}>
            {profileBusy ? <><LoaderCircle size={16} className="auth-spinner" /> Saving profile…</> : "Save profile"}
          </Button>
        </form>

        <form className="settings-form settings-password-form" onSubmit={(event) => void changePassword(event)}>
          <div className="settings-section-heading"><KeyRound size={16} /><strong>Change password</strong></div>
          <label htmlFor="settings-current-password">Current password</label>
          <Input id="settings-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={passwordBusy} />
          <label htmlFor="settings-new-password">New password</label>
          <Input id="settings-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} maxLength={128} required disabled={passwordBusy} />
          <label htmlFor="settings-confirm-password">Confirm new password</label>
          <Input id="settings-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={10} maxLength={128} required disabled={passwordBusy} />
          <small className="settings-hint">Use at least 10 characters. Your current password is checked before updating.</small>
          {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
          {passwordSaved && <p className="settings-success" role="status"><Check size={14} /> Password changed successfully.</p>}
          <Button type="submit" className="button button-dark settings-submit" disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword}>
            {passwordBusy ? <><LoaderCircle size={16} className="auth-spinner" /> Updating password…</> : "Update password"}
          </Button>
        </form>
      </DialogContent>}
    </Dialog>
  );
}

function HomePage() {
  const { user, isPending } = useAuth();
  if (isPending) return <main className="auth-loading" role="status">Checking your sign-in…</main>;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <AuroraBackground className="hero-aurora" />
          <div className="hero-copy reveal-item">
            <div className="eyebrow"><span className="eyebrow-dot" /> KUMUSTA, KAIN TAYO?</div>
            <h1>Your food story.<br />Your kind of <span>well.</span></h1>
            <p className="hero-subtitle">A private space to reflect on Filipino food and real-life habits. AI-assisted scoring is intended to support a human reviewer—not to write your advice or make decisions for you.</p>
            <div className="hero-actions">
              <Link className="button button-citrus" to="/demo">Start with a hello <ArrowRight size={17} /></Link>
              <a className="text-link" href="#how-it-works">See how it works <ArrowDown size={15} /></a>
            </div>
            <div className="hero-trust"><div className="avatar-stack"><Avatar className="community-avatar avatar-one">M</Avatar><Avatar className="community-avatar avatar-two">A</Avatar><Avatar className="community-avatar avatar-three">J</Avatar></div><p><strong>Rooted in real life.</strong><br />And the food that brings us together.</p></div>
          </div>
          <div className="hero-art reveal-item" aria-label="Illustration of a colorful nourishing meal">
            <div className="art-sun" />
            <div className="art-label"><span className="art-label-icon"><Leaf size={17} /></span><span><strong>Lasang bahay, your way</strong><small>Good food. No gold stars.</small></span></div>
            <div className="bowl-shadow" />
            <div className="bowl">
              <div className="food rice" /><div className="food greens" /><div className="food tomato" />
              <div className="food egg"><span /></div><div className="food beans" /><div className="food avocado" />
              <span className="seed seed-one" /><span className="seed seed-two" /><span className="seed seed-three" />
            </div>
            <div className="art-note"><Sparkles size={15} /> <span>Rice, gulay, ulam—and you.</span></div>
            <span className="art-leaf leaf-one"><Leaf size={40} /></span>
            <span className="art-leaf leaf-two"><Leaf size={27} /></span>
          </div>
          <div className="hero-side-note">A GENTLER KIND OF GUIDANCE <span /></div>
        </section>

        <section className="value-strip reveal-item" aria-label="AliMind values">
          <div><span className="value-icon"><Heart size={17} /></span><span>Care, not judgment</span></div>
          <div><span className="value-icon"><Sprout size={18} /></span><span>Small steps, real life</span></div>
          <div><span className="value-icon"><ShieldCheck size={17} /></span><span>Your table, your rules</span></div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-heading reveal-item">
            <span className="eyebrow">A LITTLE KUWENTO WITH YOURSELF</span>
            <h2>No one eats like a textbook.</h2>
            <p>Meals are family, budget, busy days, favorite flavors, and whatever's in the fridge. Your next step should make room for all of it.</p>
          </div>
          <div className="steps-grid">
            <article className="step-card reveal-item"><div className="step-number">01 <MessageCircle size={18} /></div><h3>Share your reflection</h3><p>Answer open-ended questions about your food habits, your world, and what matters to you.</p><span className="step-foot">Your words stay yours</span></article>
            <article className="step-card step-card-highlight reveal-item"><div className="step-number">02 <ShieldCheck size={18} /></div><h3>Human review</h3><p>In the planned workflow, AI may propose scores for a human reviewer to check. It will not write your response or recommendation.</p><span className="step-foot">Human decisions, not AI advice</span></article>
            <article className="step-card reveal-item"><div className="step-number">03 <Sprout size={18} /></div><h3>Receive a human-written next step</h3><p>A reviewer will author any interpretation and recommendation before it is shared with you.</p><span className="step-foot">Designed for care and context</span></article>
          </div>
          <p className="human-review-rollout-note">Human review is in development. The current assessment demo still uses provisional prototype logic and is not reviewed by a person.</p>
        </section>

        <section className="quote-section reveal-item" id="about">
          <div className="quote-mark">“</div>
          <blockquote>A better relationship with food doesn't ask you to leave your culture at the <em>door.</em></blockquote>
          <div className="quote-credit"><span /> THE ALIMIND APPROACH</div>
          <Link className="button button-light" to="/demo">Take a moment for yourself <ArrowRight size={17} /></Link>
        </section>

        <section className="disclaimer-band reveal-item">
          <span className="disclaimer-icon"><CircleHelp size={18} /></span>
          <p><strong>A note on this demo.</strong> AliMind is an educational prototype, not a medical tool. Its simple, English-language responses are not clinically validated. Please talk with a qualified health professional for nutrition or medical advice.</p>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Footer() {
  return <footer className="site-footer"><Brand inverse /><p>A little more well, every day.</p><span>© 2026 AliMind · A nutrition coaching demo</span></footer>;
}

function PasswordField({
  isRegister,
  password,
  onPasswordChange,
  disabled = false,
}: {
  isRegister: boolean;
  password: string;
  onPasswordChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputId = isRegister ? "create-password" : "login-password";
  const guidanceId = `${inputId}-guidance`;
  const meetsLength = password.length >= 10;
  const showGuidance = isRegister ? focused && password.length > 0 : focused;

  return (
    <div className="auth-password-field">
      <label htmlFor={inputId}>Password</label>
      <div className="password-input-wrap">
        <LockKeyhole className="password-lock-icon" size={16} aria-hidden="true" />
        <Input
          className="auth-password-input"
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={isRegister ? "new-password" : "current-password"}
          disabled={disabled}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required
          minLength={isRegister ? 10 : undefined}
          maxLength={128}
          aria-describedby={showGuidance ? guidanceId : undefined}
        />
        <Button
          className="password-visibility-button"
          variant="ghost"
          size="icon"
          type="button"
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </Button>
      </div>
      {showGuidance && (
        <div className="password-guidance-dropdown" id={guidanceId} role="region" aria-label={isRegister ? "Password requirements" : "Password help"}>
          {isRegister ? (
            <>
              <p className="password-guidance-title">Password requirements</p>
              <ul>
                <li className={meetsLength ? "password-rule-met" : "password-rule-pending"}>
                  <Check size={13} aria-hidden="true" />
                  <span>At least 10 characters{!meetsLength ? ` (${password.length}/10)` : ""}</span>
                </li>
                <li><ShieldCheck size={13} aria-hidden="true" /><span>Choose a password you don’t use elsewhere.</span></li>
              </ul>
            </>
          ) : (
            <p><CircleHelp size={14} aria-hidden="true" />Password is case-sensitive. Check Caps Lock and try the password you used when creating your account.</p>
          )}
        </div>
      )}
    </div>
  );
}

function WelcomeMessage() {
  const totalQuestionPool = QUESTIONS.length + PILOT_TTM_QUESTIONS.length + PILOT_ADDITIONAL_QUESTIONS.length;
  return <><strong>Hi there, I’m AliMind <span className="wave">✳</span></strong><br />I’m here to help you reflect on your eating habits—without judgment or pressure. The full assessment pool has {totalQuestionPool} questions. You’ll answer 70 or 71 in total, depending on your Yes/No stage-of-change answers. It includes open-ended reflections and choice-based questions. There are no right or wrong answers.</>;
}

function formatTime() {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date());
}

function ProfileCard({ profile }: { profile: Profile }) {
  const scores = [
    { key: "attitude", label: "Attitude", value: profile.scores.attitude },
    { key: "subjectiveNorm", label: "Social support", value: profile.scores.subjectiveNorm },
    { key: "perceivedControl", label: "Perceived control", value: profile.scores.perceivedControl },
  ];
  return (
    <Card className="profile-card" role="region" aria-label="Your provisional profile">
      <div className="profile-title"><span className="profile-avatar"><Sprout size={17} /></span><div><strong>Your snapshot</strong><small>Provisional · based on your answers</small></div></div>
      <div className="profile-coverage"><span>YOUR RESPONSES</span><strong key={profile.answered} className="count-tick">{profile.answered} <small>/ {profile.total}</small></strong></div>
      <div className="score-list">
        {scores.map(({ key, label, value }) => <div className="score-row" key={`${key}-${value ?? "pending"}`}>
          <div className="score-label"><span>{label}</span><strong>{value === undefined ? "—" : `${value}`}</strong></div>
          <Progress className="score-track" value={value ?? 0} label={`${label}: ${value === undefined ? "not enough answers" : `${value} out of 100`}`} />
          {value === undefined && <small className="score-missing">Not enough matched answers</small>}
        </div>)}
      </div>
      <div className="stage-panel" key={profile.stage ?? "pending"}><span className="stage-label"><Sparkles size={13} /> READINESS</span><strong>{profile.stage ?? "Not enough answers"}</strong>{profile.stage && <p>{getStageDescription(profile.stage)}</p>}</div>
      <div className="profile-legend"><span /> Experimental BERT TPB estimate · readiness remains rule-based · not clinical</div>
    </Card>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const bot = message.sender === "bot";
  return (
    <div className={`message-row ${bot ? "message-bot" : "message-user"}`}>
      {bot && <Avatar className="bot-avatar"><Sprout size={15} /></Avatar>}
      <div className="message-content"><div className="message-bubble">{message.id === 0 ? <WelcomeMessage /> : message.text}</div><span className="message-time">{bot ? "AliMind" : "You"} · {formatTime()}</span></div>
      {!bot && <Avatar className="user-avatar">Y</Avatar>}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="message-row message-bot typing-row" role="status" aria-label="AliMind is typing">
      <Avatar className="bot-avatar"><Sprout size={15} /></Avatar>
      <div className="message-content">
        <div className="typing-bubble">
          <span /><span /><span />
          <span className="typing-label">AliMind is thinking</span>
        </div>
      </div>
    </div>
  );
}

function ConsentNotice({ onStart, disabled = false }: { onStart: () => void; disabled?: boolean }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <div className="consent-box">
      <div className="consent-heading"><ShieldCheck size={17} /><strong>Before we begin</strong></div>
      <p>Your answers and chat messages will be saved to the configured Supabase project and linked to your account, so you can resume later. Don’t include identifying or sensitive health information. This demo isn’t medical advice.</p>
      <label className="consent-check"><Checkbox id="demo-consent" checked={accepted} onCheckedChange={setAccepted} /><span>I understand and agree to continue with this demo.</span></label>
      <Button className="button button-dark consent-button" disabled={!accepted || disabled} onClick={onStart}>I’m ready <ArrowRight size={15} /></Button>
    </div>
  );
}

function CompletionCard({ synthetic = false }: { synthetic?: boolean }) {
  return (
    <div className="completion-card">
      <div className="completion-icon"><ShieldCheck size={19} /></div>
      <span className="eyebrow">SUBMITTED FOR HUMAN REVIEW</span>
      <h3>{synthetic ? "Test submission saved." : "Thank you for sharing."}</h3>
      <p>{synthetic
        ? "This synthetic assessment and its scores are saved in the reviewer queue."
        : "Your assessment is saved for a human reviewer. No recommendation is shown before review."}</p>
    </div>
  );
}

function isTpbQuestion(question: LiveQuestion): question is Question {
  return "construct" in question;
}

function isTtmQuestion(question: LiveQuestion): question is PilotTtmQuestion {
  return question.id.startsWith("pilot-ttm-");
}

function isAdditionalQuestion(question: LiveQuestion): question is PilotAdditionalQuestion {
  return question.id.startsWith("pilot-additional-");
}

function createLiveQuestionPool(): LiveQuestion[] {
  return [
    ...shuffleQuestions(QUESTIONS),
    ...PILOT_TTM_QUESTIONS,
    ...PILOT_ADDITIONAL_QUESTIONS,
  ];
}

function getApplicableLiveQuestions(questions: LiveQuestion[], answers: Answer[]) {
  const answeredById = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questions.filter((question) => {
    if (!isTtmQuestion(question) || !question.dependsOn) return true;
    const dependsOn = question.dependsOn;
    const dependency = answeredById.get(
      questions.find((item) => item.id === `pilot-ttm-${String(dependsOn.questionNumber).padStart(2, "0")}`)?.id
        ?? `pilot-ttm-${String(dependsOn.questionNumber).padStart(2, "0")}`,
    );
    return dependency?.response?.trim().toLowerCase() === (dependsOn.answer ? "yes" : "no");
  });
}

function getExpectedLiveQuestions(questions: LiveQuestion[], answers: Answer[]) {
  const answeredById = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questions.filter((question) => {
    if (!isTtmQuestion(question) || !question.dependsOn) return true;
    const dependencyQuestionId = `pilot-ttm-${String(question.dependsOn.questionNumber).padStart(2, "0")}`;
    const dependencyQuestion = questions.find((item) => item.id === dependencyQuestionId);
    if (dependencyQuestion && isTtmQuestion(dependencyQuestion) && dependencyQuestion.dependsOn) {
      const ancestorId = `pilot-ttm-${String(dependencyQuestion.dependsOn.questionNumber).padStart(2, "0")}`;
      const ancestorAnswer = answeredById.get(ancestorId)?.response?.trim().toLowerCase();
      if (
        ancestorAnswer !== undefined &&
        ancestorAnswer !== (dependencyQuestion.dependsOn.answer ? "yes" : "no")
      ) return false;
    }
    const dependencyResponse = answeredById.get(dependencyQuestionId)?.response?.trim().toLowerCase();
    return dependencyResponse === undefined
      || dependencyResponse === (question.dependsOn.answer ? "yes" : "no");
  });
}

function getLiveProfile(questions: LiveQuestion[], answers: Answer[]): Profile {
  const tpbQuestions = questions.filter(isTpbQuestion);
  const profile = calculateProfile(tpbQuestions, answers);
  const ttmResult = classifyTtmStage(createTtmAnswersFromResponses(answers));
  return {
    ...profile,
    total: getExpectedLiveQuestions(questions, answers).length,
    stage: ttmResult.status === "classified" ? ttmResult.stage : null,
  };
}

function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isPending, refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";
  const requestedPath = (location.state as { from?: string } | null)?.from;
  const nextPath = requestedPath === "/demo"
    ? "/demo"
    : import.meta.env.DEV && requestedPath === "/pipeline-lab"
      ? "/pipeline-lab"
      : "/dashboard";

  if (!isPending && user) return <Navigate to={nextPath} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isRegister) {
        const { data, error: signUpError } = await getAuthClient().signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim() },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          throw new Error("Supabase did not create an active session because email confirmation is required. Disable Confirm email under Authentication → Providers → Email; the profiles table cannot override this Auth setting.");
        }
      } else {
        const { error: signInError } = await getAuthClient().signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
      await refresh();
      navigate(nextPath, { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn't reach the sign-in service. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main className="auth-page">
        <AuroraBackground className="auth-aurora" />
        <Card className="auth-card">
          <div className="auth-card-mark"><Sprout size={19} /></div>
          <span className="eyebrow">{isRegister ? "A FRESH START" : "WELCOME BACK"}</span>
          <h1>{isRegister ? "Make room for you." : "Good to see you."}</h1>
          <p>{isRegister ? "Create an account to start and resume your private assessment." : "Sign in to pick up your assessment where you left off."}</p>
          <form className="auth-form" aria-busy={busy} onSubmit={(event) => void submit(event)}>
            <fieldset className="auth-fields" disabled={busy || isPending}>
              {isRegister && <label>Your name<Input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></label>}
              <label>Email address<Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label>
            <PasswordField isRegister={isRegister} password={password} onPasswordChange={setPassword} />
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button className="button button-dark auth-submit" type="submit" disabled={busy || isPending} aria-busy={busy}>
              {busy
                ? <><LoaderCircle className="auth-spinner" size={17} aria-hidden="true" /><span>{isRegister ? "Creating account…" : "Signing in…"}</span></>
                : <>{isRegister ? "Create my account" : "Log in"}<ArrowRight size={16} /></>}
            </Button>
            {busy && <p className="auth-pending" role="status" aria-live="polite">Securely connecting to your account. This may take a few seconds.</p>}
          </form>
          <p className="auth-switch">
            {isRegister ? "Already have an account?" : "New to AliMind?"}{" "}
            <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Log in" : "Create an account"}</Link>
          </p>
          <div className="auth-storage-note"><ShieldCheck size={14} /> Sign-in is provided by Supabase. Assessment data is stored in its Postgres database.</div>
        </Card>
      </main>
      <Footer />
    </>
  );
}

function getAssessmentQuestionPrompt(questionId: string) {
  return QUESTIONS.find((question) => question.id === questionId)?.prompt
    ?? PILOT_TTM_QUESTIONS.find((question) => question.id === questionId)?.prompt
    ?? PILOT_ADDITIONAL_QUESTIONS.find((question) => question.id === questionId)?.prompt
    ?? "Question prompt unavailable.";
}

function DashboardAmbientRipples() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    let spawnTimer: number;
    const removalTimers = new Set<number>();

    const spawnRipple = () => {
      const ripple = {
        id: nextId.current++,
        x: 8 + Math.random() * 84,
        y: 12 + Math.random() * 76,
        size: 130 + Math.random() * 110,
      };
      setRipples((current) => [...current, ripple]);
      const removalTimer = window.setTimeout(() => {
        setRipples((current) => current.filter(({ id }) => id !== ripple.id));
        removalTimers.delete(removalTimer);
      }, 4300);
      removalTimers.add(removalTimer);
      spawnTimer = window.setTimeout(spawnRipple, 1400 + Math.random() * 2200);
    };

    spawnTimer = window.setTimeout(spawnRipple, 80);
    return () => {
      window.clearTimeout(spawnTimer);
      removalTimers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    <div className="dashboard-ambient-ripples" aria-hidden="true">
      {ripples.map(({ id, x, y, size }) => (
        <span
          className="dashboard-ambient-ripple"
          key={id}
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
        />
      ))}
    </div>
  );
}

function DashboardPage() {
  const { user, isPending } = useAuth();
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileError, setProfileError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [sessionResultsOpen, setSessionResultsOpen] = useState(false);
  const [sessionTarget, setSessionTarget] = useState<AssessmentSummary | null>(null);
  const [sessionDetail, setSessionDetail] = useState<AssessmentSessionDetail | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    setProfileName(null);
    setProfileError("");
    void (async () => {
      try {
        const { data, error: requestError } = await getSupabaseClient()
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;
        if (requestError) {
          setProfileError(requestError.message);
          return;
        }
        setProfileName(data?.display_name ?? "");
      } catch (requestError) {
        if (!active) return;
        setProfileError(requestError instanceof Error ? requestError.message : "The saved profile could not be loaded.");
      }
    })();
    void loadAssessmentHistory(user.id)
      .then((records) => {
        if (active) setAssessments(records);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Couldn't load your assessment history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user, reloadKey]);

  async function openSessionResults(assessment: AssessmentSummary) {
    setSessionTarget(assessment);
    setSessionResultsOpen(true);
    setSessionDetail(null);
    setSessionLoading(true);
    setSessionError("");
    try {
      if (!user) throw new Error("Please sign in to access your assessment.");
      const detail = await loadAssessmentDetail(assessment.id, user.id);
      setSessionDetail(detail);
    } catch (requestError) {
      setSessionError(requestError instanceof Error ? requestError.message : "Could not load this session’s results.");
    } finally {
      setSessionLoading(false);
    }
  }

  if (isPending || !user) return <AuthGate returnTo="/dashboard" />;

  const fallbackName = typeof user.user_metadata.name === "string"
    ? user.user_metadata.name
    : user.email?.split("@")[0] ?? "there";
  const displayName = profileName?.trim() || fallbackName;
  const activeAssessment = assessments.find((assessment) => assessment.status === "in_progress");
  const completedCount = assessments.filter((assessment) => assessment.status === "completed").length;
  const visibleAssessments = assessments.filter((assessment, index) =>
    index < 4 || assessment.reviewDelivery !== null,
  );
  const latestAssessment = assessments[0];
  const assessmentAction = activeAssessment ? "Resume reflection" : error ? "Open reflections" : "Start reflection";

  return (
    <>
      <Header />
      <main className="dashboard-page">
        <div className="dashboard-heading">
          <div><span className="eyebrow">YOUR DASHBOARD</span><h1>Welcome back, {displayName}.</h1><p>Your reflections and next step, all in one place.</p></div>
          <span className="dashboard-date"><CalendarDays size={15} />{new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date())}</span>
        </div>
        {profileError && <p className="form-error dashboard-error" role="alert">Couldn’t load your saved profile name: {profileError}</p>}
        <section className="dashboard-hero">
          <DashboardAmbientRipples />
          <div className="dashboard-hero-copy">
            <span className="dashboard-kicker"><Sparkles size={14} /> YOUR REFLECTION</span>
            <h2>{activeAssessment ? "Continue where you left off." : "Ready when you are."}</h2>
            <p>{activeAssessment
              ? `You’ve answered ${activeAssessment.answered} of ${activeAssessment.total} questions. Your progress is saved and ready to continue.`
              : error
                ? "Your saved reflection status couldn't be loaded. Open the reflection area to check for saved progress."
                : "Start a private conversation about your food habits. You can pause and return whenever you need."}</p>
            <Link className="button button-citrus dashboard-cta" to="/demo">{assessmentAction}<ArrowRight size={16} /></Link>
          </div>
          <div className="dashboard-hero-art" aria-hidden="true"><div className="dashboard-orbit dashboard-orbit-one" /><div className="dashboard-orbit dashboard-orbit-two" /><span><Sprout size={43} /></span></div>
        </section>

        <section className="dashboard-stats" aria-label="Your activity">
          <Card className="dashboard-stat"><span className="dashboard-stat-icon"><MessageCircle size={17} /></span><div><strong>{loading || error ? "—" : assessments.length}</strong><span>Reflections</span></div><small>saved to your account</small></Card>
          <Card className="dashboard-stat"><span className="dashboard-stat-icon stat-icon-complete"><Check size={17} /></span><div><strong>{loading || error ? "—" : completedCount}</strong><span>Completed</span></div><small>each one a small step</small></Card>
          <Card className="dashboard-stat"><span className="dashboard-stat-icon stat-icon-time"><Clock3 size={17} /></span><div><strong>{loading || error ? "—" : activeAssessment ? `${activeAssessment.answered}/20` : "—"}</strong><span>{loading ? "Loading" : error ? "Unavailable" : activeAssessment ? "In progress" : "No active reflection"}</span></div><small>{activeAssessment && !loading && !error ? "ready to continue" : error ? "check your connection" : "start whenever you're ready"}</small></Card>
        </section>

        <section className="dashboard-lower">
          <Card className="dashboard-recent">
            <div className="dashboard-section-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Recent reflections</h2></div></div>
            {loading && <div className="dashboard-loading" role="status"><LoaderCircle size={17} className="auth-spinner" /> Loading your conversations…</div>}
            {error && <div className="dashboard-load-error"><p role="alert">{error}</p><Button variant="outline" size="sm" onClick={() => { setLoading(true); setError(""); setReloadKey((key) => key + 1); }}>Try again</Button></div>}
            {!loading && !error && assessments.length === 0 && <div className="dashboard-empty"><span><Leaf size={19} /></span><div><strong>No reflections yet.</strong><p>Your first one will appear here when you’re ready.</p></div><Link className="button button-small button-dark" to="/demo">Start <ArrowRight size={14} /></Link></div>}
            {!loading && !error && visibleAssessments.map((assessment) => (
              <article className="dashboard-recent-item" key={assessment.id}>
                <span className={`history-status status-${assessment.status}`}>{assessment.status.replace("_", " ")}</span>
                <div><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(assessment.startedAt))}</strong><small>{assessment.answered} of 20 responses · private reflection</small></div>
                {assessment.reviewDelivery ? (
                  <Button variant="outline" size="sm" onClick={() => void openSessionResults(assessment)}>View session results</Button>
                ) : assessment.status === "in_progress" ? (
                  <Link className="dashboard-resume-link" to="/demo" aria-label={`Resume reflection from ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(assessment.startedAt))}`}><ArrowRight size={16} /></Link>
                ) : <span />}
                {assessment.reviewDelivery && (
                  <div className="dashboard-recent-delivery">
                    <small>Message from your reviewer · Delivered {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(assessment.reviewDelivery.deliveredAt))}</small>
                    <p>{assessment.reviewDelivery.response}</p>
                    {assessment.reviewDelivery.recipe && (
                      <p><strong>Chosen dish</strong><br />{assessment.reviewDelivery.recipe}</p>
                    )}
                    <p><strong>Recommendation:</strong> {assessment.reviewDelivery.recommendation}</p>
                  </div>
                )}
              </article>
            ))}
          </Card>
          <aside className="dashboard-note">
            <div className="dashboard-note-icon"><ShieldCheck size={17} /></div>
            <span className="eyebrow">YOUR DATA</span>
            <h2>Private by design.</h2>
            <p>Your reflections are linked to your account. AliMind is an educational prototype, not a medical tool; avoid sharing sensitive health details.</p>
            {latestAssessment && <small>Last activity: {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(latestAssessment.updatedAt))}</small>}
          </aside>
        </section>
        <p className="account-disclaimer">AliMind is an educational prototype, not a medical tool. Your assessment data is stored in the configured Supabase project. Don’t enter sensitive health details.</p>
      </main>
      <Dialog
        open={sessionResultsOpen}
        onOpenChange={(open) => {
          setSessionResultsOpen(open);
          if (!open) {
            setSessionTarget(null);
            setSessionDetail(null);
            setSessionError("");
          }
        }}
      >
        {sessionResultsOpen && sessionTarget && (
          <DialogContent className="reviewer-details-dialog dashboard-session-dialog">
            <span className="eyebrow">PRIVATE SESSION RESULTS</span>
            <DialogTitle>Reflection results</DialogTitle>
            <DialogDescription>
              Session from {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(sessionTarget.startedAt))}
            </DialogDescription>
            <div className="reviewer-dialog-scroll dashboard-session-scroll">
              {sessionLoading && <p role="status">Loading session results…</p>}
              {sessionError && <p className="form-error" role="alert">{sessionError}</p>}
              {sessionDetail && (
                <>
                  {sessionTarget.reviewDelivery && (
                    <section className="dashboard-session-delivery">
                      <h3>Message from your reviewer</h3>
                      <p>{sessionTarget.reviewDelivery.response}</p>
                      {sessionTarget.reviewDelivery.recipe && (
                        <p><strong>Chosen dish</strong><br />{sessionTarget.reviewDelivery.recipe}</p>
                      )}
                      <p><strong>Recommendation:</strong> {sessionTarget.reviewDelivery.recommendation}</p>
                    </section>
                  )}
                  <section className="dashboard-session-answers">
                    <h3>Your answers</h3>
                    {sessionDetail.questionOrder.map((questionId, index) => {
                      const answer = sessionDetail.answers.find((item) => item.questionId === questionId);
                      return (
                        <details key={questionId}>
                          <summary>Q{index + 1} · {getAssessmentQuestionPrompt(questionId)}</summary>
                          <p>{answer?.response ?? "No response recorded."}</p>
                        </details>
                      );
                    })}
                  </section>
                  {sessionDetail.messages.length > 0 && (
                    <section className="dashboard-session-transcript">
                      <h3>Conversation</h3>
                      {sessionDetail.messages.map((message) => (
                        <article key={message.id}>
                          <strong>{message.sender === "bot" ? "AliMind" : "You"}</strong>
                          <p>{message.text}</p>
                        </article>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
            <div className="reviewer-dialog-actions">
              <Button variant="outline" onClick={() => setSessionResultsOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <Footer />
    </>
  );
}

function ProtectedDemo() {
  const { user, isPending } = useAuth();
  if (isPending) return <main className="auth-loading" role="status">Checking your sign-in…</main>;
  if (!user) return <AuthGate />;
  return <DemoPage />;
}

function ProtectedPipelineLab() {
  const { user, isPending } = useAuth();
  if (isPending) return <main className="auth-loading" role="status">Checking your sign-in…</main>;
  if (!user) return <Navigate to="/login" state={{ from: "/pipeline-lab" }} replace />;
  return <PipelineLabPage />;
}

function ProtectedAccountAccess() {
  const { user, isPending } = useAuth();
  if (isPending) return <main className="auth-loading" role="status">Checking your sign-in…</main>;
  if (!user) return <Navigate to="/login" state={{ from: "/account" }} replace />;
  return <><Header /><AccountAccessPage /><Footer /></>;
}

function ProtectedReviewerWorkspace() {
  const { user, isPending } = useAuth();
  if (isPending) return <main className="auth-loading" role="status">Checking your sign-in…</main>;
  if (!user) return <Navigate to="/login" state={{ from: "/reviewer" }} replace />;
  return <><Header /><ReviewerWorkspacePage /><Footer /></>;
}

function AuthGate({ returnTo = "/demo" }: { returnTo?: "/demo" | "/dashboard" }) {
  const { user, isPending } = useAuth();
  if (isPending) return <main className="auth-loading" role="status">Checking your sign-in…</main>;
  if (!user) return <Navigate to="/login" state={{ from: returnTo }} replace />;
  return null;
}

function DemoPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [questions, setQuestions] = useState<LiveQuestion[]>(createLiveQuestionPool);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, sender: "bot", text: "" }]);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingAssessment, setIsLoadingAssessment] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isScoringTestRunning, setIsScoringTestRunning] = useState(false);
  const [scoringTestResult, setScoringTestResult] = useState<AutomatedScoringTestResult | null>(null);
  const [showScoringTestPreview, setShowScoringTestPreview] = useState(false);
  const [scoringTestError, setScoringTestError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pendingBotText, setPendingBotText] = useState<string | null>(null);
  const [pendingBotMessageId, setPendingBotMessageId] = useState<string | null>(null);
  const pendingFollowUp = useRef<{ text: string; id: string } | null>(null);
  const typingTimer = useRef<number | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const profile = useMemo(() => getLiveProfile(questions, answers), [questions, answers]);
  const applicableQuestions = useMemo(
    () => getApplicableLiveQuestions(questions, answers),
    [questions, answers],
  );
  const currentQuestion = applicableQuestions.find(
    (question) => !answers.some((answer) => answer.questionId === question.id),
  ) ?? null;
  const isScoringTestPreview = showScoringTestPreview && scoringTestResult !== null;
  const displayedQuestions = isScoringTestPreview
    ? scoringTestResult.questions
    : getExpectedLiveQuestions(questions, answers);
  const displayedAnswers = isScoringTestPreview ? scoringTestResult.answers : answers;
  const displayedMessages = isScoringTestPreview ? scoringTestResult.messages : messages;
  const displayedProfile = isScoringTestPreview ? scoringTestResult.profile : profile;
  const displayedComplete = isScoringTestPreview
    ? !isScoringTestRunning && !scoringTestError
    : complete;
  const displayedStarted = isScoringTestPreview || started;

  useEffect(() => {
    let active = true;
    if (!user) {
      setIsLoadingAssessment(false);
      return () => { active = false; };
    }
    void loadActiveAssessment(user.id)
      .then((assessment) => {
        if (!active || !assessment) return;
        const liveQuestions: LiveQuestion[] = [
          ...QUESTIONS,
          ...PILOT_TTM_QUESTIONS,
          ...PILOT_ADDITIONAL_QUESTIONS,
        ];
        const questionsById = new Map(liveQuestions.map((question) => [question.id, question]));
        const restoredQuestions: LiveQuestion[] = [];
        for (const id of assessment.questionOrder) {
          const question = questionsById.get(id);
          if (!question) throw new Error("This saved assessment uses an unknown question version. Please contact the app administrator.");
          restoredQuestions.push(question);
        }
        setAssessmentId(assessment.id);
        setQuestions(restoredQuestions);
        setAnswers(assessment.answers);
        setMessages(assessment.messages);
        setStarted(true);
        setComplete(false);
        const lastMessage = assessment.messages[assessment.messages.length - 1];
        if (lastMessage?.sender === "user") {
          const nextQuestion = getApplicableLiveQuestions(restoredQuestions, assessment.answers)
            .find((question) => !assessment.answers.some((answer) => answer.questionId === question.id));
          if (nextQuestion) {
            queueBot(`${nextQuestion.prompt}`, assessment.id);
          } else {
            const restoredProfile = getLiveProfile(restoredQuestions, assessment.answers);
            queueBot(
              `Thank you for sharing so openly. That's all ${restoredQuestions.length} questions. Your snapshot is ready below—it's a simple, provisional estimate, not a clinical assessment. ${restoredProfile.stage ? `Your current readiness looks like ${restoredProfile.stage.toLowerCase()}.` : "There weren't enough matched responses to estimate readiness."}`,
              assessment.id,
              true,
            );
          }
        }
      })
      .catch((requestError: unknown) => {
        if (active) setSaveError(requestError instanceof Error ? requestError.message : "Couldn't load your saved assessment.");
      })
      .finally(() => {
        if (active) setIsLoadingAssessment(false);
      });
    return () => { active = false; };
  }, [user]);

  useEffect(() => () => {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
  }, []);

  useEffect(() => {
    const container = chatMessagesRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [messages, isTyping, complete, scoringTestResult, isScoringTestPreview]);

  function queueBot(text: string, id = assessmentId, completesAssessment = false, messageId: string = crypto.randomUUID()) {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    setPendingBotText(text);
    setPendingBotMessageId(messageId);
    setIsTyping(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reducedMotion ? 140 : Math.min(850, Math.max(480, text.length * 6));
    typingTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          if (!id) throw new Error("Your assessment session isn’t ready. Please try again.");
          const result = await apiRequest<{ assessment: { messages: ChatMessage[] } }>(
            `/api/assessments/${id}/messages`,
            { method: "POST", body: JSON.stringify({ sender: "bot", text, completed: completesAssessment, messageId }) },
          );
          setMessages(result.assessment.messages);
          setPendingBotText(null);
          setPendingBotMessageId(null);
          if (completesAssessment) setComplete(true);
          setSaveError("");
        } catch (requestError) {
          setSaveError(requestError instanceof Error ? requestError.message : "Couldn't save the chat reply.");
        } finally {
          setIsTyping(false);
          typingTimer.current = null;
        }
      })();
    }, delay);
  }

  async function startAssessment() {
    if (isTyping || isSaving || isLoadingAssessment || isScoringTestRunning) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const currentTpbQuestions = questions.filter(isTpbQuestion);
      const orderedTpbQuestions = currentTpbQuestions.length === QUESTIONS.length
        ? currentTpbQuestions
        : shuffleQuestions(QUESTIONS);
      const questionPool: LiveQuestion[] = [
        ...orderedTpbQuestions,
        ...PILOT_TTM_QUESTIONS,
        ...PILOT_ADDITIONAL_QUESTIONS,
      ];
      setQuestions(questionPool);
      const { assessment } = await apiRequest<{
        assessment: { id: string; questionOrder: string[]; messages: ChatMessage[] };
      }>("/api/assessments", {
        method: "POST",
        body: JSON.stringify({
          consent: true,
          consentVersion: "demo-supabase-v1",
          questionOrder: questionPool.map((question) => question.id),
        }),
      });
      const questionById = new Map(questionPool.map((question) => [question.id, question]));
      const savedQuestionPool = assessment.questionOrder.map((questionId) => {
        const question = questionById.get(questionId);
        if (!question) throw new Error("The server saved an unknown assessment question.");
        return question;
      });
      setQuestions(savedQuestionPool);
      setAssessmentId(assessment.id);
      setMessages(assessment.messages);
      setStarted(true);
      queueBot(`Lovely. Let's take it one question at a time. ${savedQuestionPool[0].prompt}`, assessment.id);
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Couldn't start your assessment.");
    } finally {
      setIsSaving(false);
    }
  }

  async function runAutomatedScoringTest() {
    if (isLoadingAssessment || isSaving || isTyping || isScoringTestRunning) return;
    setIsScoringTestRunning(true);
    setScoringTestError("");
    setScoringTestResult(null);
    setShowScoringTestPreview(false);
    try {
      const testQuestionPool: LiveQuestion[] = [
        ...QUESTIONS,
        ...PILOT_TTM_QUESTIONS,
        ...PILOT_ADDITIONAL_QUESTIONS,
      ];
      const testQuestions = testQuestionPool.filter(isTpbQuestion);
      const result = await apiRequest<{
        answers: Answer[];
        profile: Profile;
        questionOrder: string[];
        counts: AutomatedScoringTestResult["counts"];
      }>("/api/dev/tpb-scoring-test", {
        method: "POST",
        body: JSON.stringify({ questionOrder: testQuestionPool.map((question) => question.id) }),
      });
      const questionById = new Map(testQuestionPool.map((question) => [question.id, question]));
      const responseQuestions = result.questionOrder.map((questionId) => {
        const question = questionById.get(questionId);
        if (!question) throw new Error("The automated test returned an unknown question.");
        return question;
      });
      setScoringTestResult({
        ...result,
        profile: getLiveProfile(responseQuestions, result.answers),
        messages: createAutomatedScoringTestMessages(responseQuestions, result.answers),
        questions: responseQuestions,
      });
      setShowScoringTestPreview(true);
    } catch (requestError) {
      setScoringTestError(
        requestError instanceof Error ? requestError.message : "The automated scoring test failed.",
      );
    } finally {
      setIsScoringTestRunning(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || text.length > 1000 || isTyping || isSaving || isLoadingAssessment || isScoringTestRunning) return;
    if (!started || !assessmentId) {
      setSaveError("Please review and accept the storage consent before sending a message.");
      return;
    }

    if (complete) {
      setIsSaving(true);
      setSaveError("");
      if (pendingFollowUp.current?.text !== text) {
        pendingFollowUp.current = { text, id: crypto.randomUUID() };
      }
      try {
        const { assessment } = await apiRequest<{ assessment: { messages: ChatMessage[] } }>(
          `/api/assessments/${assessmentId}/messages`,
          { method: "POST", body: JSON.stringify({ sender: "user", text, messageId: pendingFollowUp.current.id }) },
        );
        setMessages(assessment.messages);
        setInput("");
        pendingFollowUp.current = null;
        queueBot("Thanks for sharing. I can offer ideas based on your assessment snapshot, but this prototype doesn't re-score follow-up chat messages. What feels like the smallest helpful step for you?", assessmentId);
      } catch (requestError) {
        setSaveError(requestError instanceof Error ? requestError.message : "Couldn't save your message.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!currentQuestion) return;
    const skipped = /^(skip|prefer not to answer|pass)$/i.test(text);
    const answer: Answer = isTpbQuestion(currentQuestion)
      ? makeAnswer(currentQuestion, text)
      : {
          questionId: currentQuestion.id,
          response: text,
          score: null,
        };
    setIsSaving(true);
    setSaveError("");
    try {
      const { assessment } = await apiRequest<{ assessment: { answers: Answer[]; messages: ChatMessage[] } }>(
        `/api/assessments/${assessmentId}/answers`,
        { method: "POST", body: JSON.stringify({ questionId: answer.questionId, response: answer.response }) },
      );
      setAnswers(assessment.answers);
      setMessages(assessment.messages);
      setInput("");
      const savedAnswer = assessment.answers[assessment.answers.length - 1];
      const nextQuestion = getApplicableLiveQuestions(questions, assessment.answers)
        .find((question) => !assessment.answers.some((item) => item.questionId === question.id));
      if (!nextQuestion) {
        const finalProfile = getLiveProfile(questions, assessment.answers);
        queueBot(
          `Thank you for sharing so openly. That's the full assessment. Your snapshot is ready below—it's a simple, provisional estimate, not a clinical assessment. ${finalProfile.stage ? `Your current readiness looks like ${finalProfile.stage.toLowerCase()}.` : "There weren't enough matched responses to estimate readiness."}`,
          assessmentId,
          true,
        );
      } else {
        const answerWasNotScored = isTpbQuestion(currentQuestion) && currentQuestion.construct === "intention"
          && savedAnswer?.score === null;
        queueBot(`${skipped ? "No problem—we'll leave that one unanswered. " : answerWasNotScored ? "Thanks for sharing. That answer didn't match a scoring phrase, so I'll leave it unscored rather than guess. " : ""}${nextQuestion.prompt}`, assessmentId);
      }
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Couldn't save your answer. Your input is still here; please retry.");
    } finally {
      setIsSaving(false);
    }
  }

  async function reset() {
    if (isLoadingAssessment || isSaving || isTyping || isScoringTestRunning) return;
    if (!window.confirm("Start a new assessment? An unfinished assessment will stay in your history as abandoned.")) return;
    setIsSaving(true);
    setSaveError("");
    try {
      if (assessmentId && !complete) {
        await apiRequest(`/api/assessments/${assessmentId}/abandon`, { method: "POST" });
      }
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
      setQuestions(createLiveQuestionPool());
      setAnswers([]);
      setMessages([{ id: 0, sender: "bot", text: "" }]);
      setAssessmentId(null);
      setPendingBotText(null);
      setPendingBotMessageId(null);
      pendingFollowUp.current = null;
      setStarted(false);
      setComplete(false);
      setInput("");
      setScoringTestResult(null);
      setShowScoringTestPreview(false);
      setScoringTestError("");
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Couldn't start a new assessment.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Header />
      <main className="demo-main">
        <div className="demo-topline"><button className="back-link" onClick={() => navigate("/")}><ArrowLeft size={15} /> Back to home</button><Badge className="demo-session"><span /> SIGNED IN · PRIVATE</Badge></div>
        <div className="demo-heading reveal-item"><div><span className="eyebrow">YOUR SPACE, YOUR PACE</span><h1>A conversation with AliMind</h1><p>A little reflection can be the beginning of something good.</p><small className="auth-status">{isScoringTestPreview ? "Synthetic test transcript — saved and submitted for review." : "Assessment answers and messages are stored in Supabase."}</small></div><div className="demo-heading-actions"><Button variant="outline" className="icon-button" aria-label="Help" onClick={() => setShowHelp(true)}><CircleHelp size={18} /></Button><Button variant="outline" className="reset-button" onClick={reset} disabled={isLoadingAssessment || isSaving || isTyping || isScoringTestRunning || isScoringTestPreview}><RotateCcw size={14} /> Start over</Button></div></div>
        {saveError && <div className="save-error" role="alert">{saveError}{pendingBotText && pendingBotMessageId && !isTyping && <Button variant="outline" size="sm" onClick={() => queueBot(pendingBotText, assessmentId, pendingBotText.startsWith("Thank you for sharing so openly."), pendingBotMessageId)}>Retry reply</Button>}</div>}
        {import.meta.env.DEV && (
          <section className="local-scoring-test" aria-label="Automated scoring test">
            <div className="local-scoring-test-copy">
              <strong>Local scoring test</strong>
              <small>Runs synthetic answers through the real scorer and submits the completed test to reviewers.</small>
            </div>
            <Button
              variant="outline"
              onClick={() => void runAutomatedScoringTest()}
              disabled={isLoadingAssessment || isSaving || isTyping || isScoringTestRunning}
            >
              {isScoringTestRunning ? <LoaderCircle className="pipeline-spinner" size={14} /> : <Sparkles size={14} />}
              {isScoringTestRunning ? "Scoring all questions…" : "Run automated test"}
            </Button>
            {isScoringTestPreview && (
              <Button variant="outline" onClick={() => setShowScoringTestPreview(false)} disabled={isScoringTestRunning}>
                Return to saved chat
              </Button>
            )}
            {isScoringTestRunning && (
              <p className="local-scoring-test-feedback" role="status">
                Running 62 reflection questions, the branch-aware TTM questions, and 6 additional questions. The full pool is 72; this path skips the inapplicable branch question. The first run may take longer while BERT loads.
              </p>
            )}
            {isScoringTestPreview && scoringTestResult && !isScoringTestRunning && !scoringTestError && (
              <p className="local-scoring-test-feedback" role="status">
                Complete: {scoringTestResult.counts.tpbScored}/{scoringTestResult.counts.tpbTotal} TPB model calculations and{" "}
                {scoringTestResult.counts.intentionScored}/{scoringTestResult.counts.intentionTotal} intention calculations, plus TTM and additional-choice responses.
                The full simulated conversation is saved below and submitted to the reviewer queue.
              </p>
            )}
            {scoringTestError && <p className="local-scoring-test-feedback is-error" role="alert">{scoringTestError}</p>}
          </section>
        )}
        <div className="demo-layout">
          <Card className="chat-card reveal-item" role="region" aria-label="Assessment conversation">
            <div className="chat-header"><div className="chat-person"><Avatar className="bot-avatar bot-avatar-large"><Sprout size={18} /></Avatar><span><strong>AliMind</strong><small><span /> Here with you</small></span></div><Badge className="chat-session-label"><ShieldCheck size={13} /> {isScoringTestPreview ? "LOCAL TEST · SUBMITTED" : "SAVED PRIVATELY"}</Badge></div>
            <div className="chat-progress"><div className="progress-meta"><span>{isScoringTestPreview ? "AUTOMATED TEST" : displayedStarted ? "YOUR REFLECTION" : "A GENTLE START"}</span><strong>{displayedStarted ? `${displayedAnswers.length} / ${displayedQuestions.length}` : "Take your time"}</strong></div><Progress className="progress-bar" value={displayedStarted ? (displayedAnswers.length / displayedQuestions.length) * 100 : 0} label={`Assessment progress: ${displayedAnswers.length} of ${displayedQuestions.length} questions answered`} /></div>
            <div ref={chatMessagesRef} className="chat-messages" aria-live="polite" aria-relevant="additions" aria-busy={isTyping || isSaving || isScoringTestRunning}>
              {displayedMessages.map((message) => <ChatBubble key={message.id} message={message} />)}
              {!isScoringTestPreview && isLoadingAssessment && <div className="loading-assessment" role="status">Loading your saved conversation…</div>}
              {isTyping && <TypingIndicator />}
              {!isScoringTestPreview && !started && !isLoadingAssessment && <ConsentNotice onStart={() => void startAssessment()} disabled={isTyping || isSaving || isScoringTestRunning} />}
              {displayedComplete && <CompletionCard synthetic={isScoringTestPreview} />}
            </div>
            <form className="chat-compose" onSubmit={submit}>
              <label className="sr-only" id="chat-input-label" htmlFor={currentQuestion && (isTtmQuestion(currentQuestion) || (isAdditionalQuestion(currentQuestion) && currentQuestion.options)) ? undefined : "chat-input"}>{displayedStarted ? "Your answer" : "Message AliMind"}</label>
              {currentQuestion && isTtmQuestion(currentQuestion) ? (
                <div className="chat-choice-options" role="group" aria-labelledby="chat-input-label">
                  {["Yes", "No"].map((option) => (
                    <Button key={option} type="button" variant={input === option ? "default" : "outline"} aria-pressed={input === option} onClick={() => setInput(option)} disabled={isSaving || isTyping || isLoadingAssessment}>
                      {option}
                    </Button>
                  ))}
                </div>
              ) : currentQuestion && isAdditionalQuestion(currentQuestion) && currentQuestion.options ? (
                <div className="chat-choice-options" role="group" aria-labelledby="chat-input-label">
                  {currentQuestion.options.map((option) => {
                    const selected = currentQuestion.type === "multiSelect"
                      ? input.split(" | ").includes(option)
                      : input === option;
                    return (
                      <Button
                        key={option}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        aria-pressed={selected}
                        disabled={isSaving || isTyping || isLoadingAssessment}
                        onClick={() => {
                          if (currentQuestion.type !== "multiSelect") {
                            setInput(option);
                            return;
                          }
                          const selectedOptions = input ? input.split(" | ").filter(Boolean) : [];
                          if (option === "None") {
                            setInput(selectedOptions.includes("None") ? "" : "None");
                            return;
                          }
                          const withoutNone = selectedOptions.filter((item) => item !== "None");
                          setInput(withoutNone.includes(option)
                            ? withoutNone.filter((item) => item !== option).join(" | ")
                            : [...withoutNone, option].join(" | "));
                        }}
                      >
                        {option}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <Input
                  id="chat-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  type={currentQuestion && isAdditionalQuestion(currentQuestion) && currentQuestion.type === "number" ? "number" : "text"}
                  min={currentQuestion && isAdditionalQuestion(currentQuestion) && currentQuestion.type === "number" ? 1 : undefined}
                  max={currentQuestion && isAdditionalQuestion(currentQuestion) && currentQuestion.type === "number" ? 120 : undefined}
                  step={currentQuestion && isAdditionalQuestion(currentQuestion) && currentQuestion.type === "number" ? 1 : undefined}
                  placeholder={
                    currentQuestion && isAdditionalQuestion(currentQuestion) && currentQuestion.type === "number"
                      ? "Enter a number…"
                      : displayedStarted ? "Share whatever feels right…" : "Accept the consent above to begin…"
                  }
                  maxLength={1000}
                  disabled={isLoadingAssessment || isSaving || isTyping || isScoringTestRunning || isScoringTestPreview || !started || (!currentQuestion && !complete)}
                />
              )}
              <Button type="submit" className="send-button" aria-label="Send message" disabled={isLoadingAssessment || isSaving || isTyping || isScoringTestRunning || isScoringTestPreview || !input.trim() || input.length > 1000 || !started || (!currentQuestion && !complete)}><Send size={17} /></Button>
            </form>
            <div className="chat-footer"><span><ShieldCheck size={13} /> {isScoringTestPreview ? "Synthetic test — saved for human review." : "Stored privately in Supabase."}</span><span>{input.length}/1000</span></div>
          </Card>
          <aside className="profile-sidebar reveal-item">
            <ProfileCard profile={displayedProfile} />
            <div className="sidebar-note"><span className="sidebar-note-icon"><Heart size={15} /></span><p><strong>A gentle reminder</strong><br />This isn't about being perfect. It's about finding what feels a little better for you.</p></div>
            <div className="session-note"><Clock3 size={14} /><span>Your unfinished assessment resumes after sign-in.</span></div>
          </aside>
        </div>
        <div className="demo-disclaimer"><CircleHelp size={15} /><p><strong>Not medical advice.</strong> This educational demo uses experimental BERT estimates for TPB answers and English phrase matching for intention. Its estimates are not validated. For personal nutrition or medical advice, consult a qualified health professional.</p></div>
      </main>
      <Footer />
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        {showHelp && <DialogContent className="help-dialog">
          <span className="help-icon"><CircleHelp size={21} /></span>
          <DialogTitle>A little help</DialogTitle>
          <DialogDescription>The reflection questions are open-ended; stage-of-change and additional questions use fixed choices. There are no right or wrong answers, and you can skip a reflection question by typing “skip”.</DialogDescription>
          <p>Your assessment answers and chat messages are stored in Supabase and tied to your account. Row-level security restricts access to the owner. Don’t include sensitive health details.</p>
          <Button className="button button-dark" onClick={() => setShowHelp(false)}>Got it <Check size={16} /></Button>
        </DialogContent>}
      </Dialog>
    </>
  );
}

function App() {
  const location = useLocation();

  useEffect(() => {
    const revealItems = document.querySelectorAll<HTMLElement>(".reveal-item");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((element) => element.setAttribute("data-reveal", "visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-reveal", "visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -28px 0px" },
    );

    revealItems.forEach((element, index) => {
      element.style.setProperty("--reveal-delay", `${(index % 3) * 90}ms`);
      element.setAttribute("data-reveal", "hidden");
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    <div key={location.pathname} className="route-transition">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/account" element={<ProtectedAccountAccess />} />
        <Route path="/reviewer" element={<ProtectedReviewerWorkspace />} />
        {import.meta.env.DEV && <Route path="/reviewer-sample" element={<><Header /><ReviewerWorkspacePage sampleMode /><Footer /></>} />}
        <Route path="/demo" element={<ProtectedDemo />} />
        {import.meta.env.DEV && <Route path="/pipeline-lab" element={<ProtectedPipelineLab />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

function NotFound() {
  return <main className="not-found"><Brand /><h1>Looks like a wrong turn.</h1><p>Let’s get you back to a fresh start.</p><Link className="button button-dark" to="/">Back home <ArrowRight size={16} /></Link></main>;
}

export default App;
