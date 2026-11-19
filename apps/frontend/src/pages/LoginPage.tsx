import { useForm } from "@mantine/form";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { loginSchema } from "@myapp/shared";
import { errorMessage } from "../api/client";
import { useLogin, useMe } from "../api/hooks";

/** Field messages; the shared schema stays the source of truth for what a valid email is. */
export function validateEmail(value: string): string | null {
  if (!value.trim()) return "Enter your email address";
  return loginSchema.shape.email.safeParse(value).success ? null : "Enter a valid email address";
}
export const validatePassword = (value: string): string | null =>
  value ? null : "Enter your password";

// TODO: add real logo files under apps/frontend/public/logos/ (deped.png, bagong-pilipinas.png,
// hrod.png, insighted.png) and set `src` on each entry; until then a text chip renders.
const LOGOS: Array<{ name: string; alt: string; src?: string }> = [
  { name: "DepEd", alt: "Department of Education seal" },
  { name: "Bagong Pilipinas", alt: "Bagong Pilipinas logo" },
  { name: "HROD", alt: "Human Resource and Organizational Development logo" },
  { name: "InsightED", alt: "InsightED logo" },
];

/** Static previews of what the portal holds; identifiers are sample telemetry, not live data. */
const HERO_CARDS = [
  { title: "Sprint Progress", meta: "SPRINT-12 · 68%", pct: 68 },
  { title: "Active Risks", meta: "RAID-07 · 3 open", pct: 40 },
  { title: "Portal Status", meta: "v1.0.0 · stable", pct: 100 },
] as const;

const MAX_TILT_DEG = 3;
const reducedMotion = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  const [shaking, setShaking] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const form = useForm({
    initialValues: { email: "", password: "" },
    validateInputOnBlur: true,
    validate: {
      email: validateEmail,
      password: validatePassword,
    },
  });

  // Cursor spotlight: one rAF-throttled listener writes CSS variables; no React state per move.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reducedMotion()) return;
    let frame = 0;
    const onMove = (e: globalThis.PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        stage.style.setProperty("--mouse-x", `${e.clientX}px`);
        stage.style.setProperty("--mouse-y", `${e.clientY}px`);
      });
    };
    stage.addEventListener("pointermove", onMove);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Wired by hand: Mantine's getInputProps adds an `error` prop that is not a DOM attribute.
  const native = (field: "email" | "password") => ({
    value: form.values[field],
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      form.setFieldValue(field, e.currentTarget.value),
    onBlur: () => form.validateField(field),
  });

  if (me.data) return <Navigate to={from} replace />;

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));
  const emailError = form.errors.email;
  const passwordError = form.errors.password;

  /** Capped perspective tilt for mouse pointers only; touch and reduced motion never tilt. */
  const tilt = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || reducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty("--tilt-y", `${(x * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
    e.currentTarget.style.setProperty("--tilt-x", `${(-y * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
  };
  const untilt = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.removeProperty("--tilt-x");
    e.currentTarget.style.removeProperty("--tilt-y");
  };
  const cardPointer = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--px", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--py", `${e.clientY - r.top}px`);
  };
  const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

  return (
    <div className="login-stage" ref={stageRef}>
      <div className="ls-aurora" aria-hidden="true">
        <span className="ls-blob ls-blob--a" />
        <span className="ls-blob ls-blob--b" />
        <span className="ls-blob ls-blob--c" />
        <span className="ls-blob ls-blob--d" />
      </div>
      <div className="ls-grid" aria-hidden="true" />
      <div className="ls-spot" aria-hidden="true" />

      <header className="ls-top">
        <span className="ls-pill ls-in" style={delay(0)}>
          <span className="ls-dot" aria-hidden="true" />
          Portal ready
        </span>
        <div className="ls-dock ls-in" style={delay(80)}>
          {LOGOS.map((l) => (
            <span key={l.name} className="ls-chip">
              {l.src ? <img src={l.src} alt={l.alt} /> : l.name}
            </span>
          ))}
        </div>
      </header>

      <main className="ls-main">
        <section aria-label="About InsightED AGILE">
          <div className="ls-eyebrow ls-in" style={delay(120)}>
            Department of Education
          </div>
          <span className="ls-bar ls-in" style={delay(160)} aria-hidden="true" />
          <h1 className="ls-title ls-in" style={delay(200)}>
            InsightED AGILE
          </h1>
          <p className="ls-lede ls-in" style={delay(260)}>
            Plan sprints, track work and manage risks for your projects in one place.
          </p>
          <ul className="ls-cards">
            {HERO_CARDS.map((c, i) => (
              <li key={c.title} className="ls-in" style={delay(340 + i * 80)}>
                <button
                  type="button"
                  className="ls-card"
                  aria-current={activeCard === i}
                  onPointerEnter={() => setActiveCard(i)}
                  onPointerMove={cardPointer}
                  onFocus={() => setActiveCard(i)}
                >
                  <span className="ls-card-title">{c.title}</span>
                  <span className="ls-card-meta">{c.meta}</span>
                  <span className="ls-meter" aria-hidden="true">
                    <span style={{ "--pct": c.pct } as CSSProperties} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="ls-tilt ls-in" style={delay(200)}>
          <section
            className="ls-auth"
            aria-label="Sign in"
            onPointerMove={tilt}
            onPointerLeave={untilt}
          >
            <form
              className="ls-form"
              noValidate
              aria-busy={login.isPending}
              onSubmit={form.onSubmit(
                (values) => {
                  if (login.isPending) return;
                  login.mutate(values, {
                    onSuccess: () => {
                      void navigate(from, { replace: true });
                    },
                  });
                },
                (errors) => {
                  if (errors.email) setShaking(true);
                },
              )}
            >
              <div>
                <h2 className="ls-heading">Sign in</h2>
                <p className="ls-sub">Use your InsightED AGILE account.</p>
              </div>
              {login.isError ? (
                <div className="ls-alert" role="alert">
                  {errorMessage(login.error)}
                </div>
              ) : null}

              <div className="ls-field">
                <label className="ls-label" htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  className={shaking ? "ls-input ls-shake" : "ls-input"}
                  type="email"
                  autoComplete="email"
                  placeholder="name@deped.gov.ph"
                  autoFocus
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? "login-email-error" : undefined}
                  onAnimationEnd={() => setShaking(false)}
                  {...native("email")}
                />
                <div className="ls-slot">
                  {emailError ? (
                    <p className="ls-error" id="login-email-error">
                      {emailError}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="ls-field">
                <label className="ls-label" htmlFor="login-password">
                  Password
                </label>
                <div className="ls-input-wrap">
                  <input
                    id="login-password"
                    className="ls-input ls-input--toggle"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={
                      [passwordError ? "login-password-error" : "", capsLock ? "login-caps" : ""]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    onKeyDown={onKey}
                    onKeyUp={onKey}
                    onBlurCapture={() => setCapsLock(false)}
                    {...native("password")}
                  />
                  <button
                    type="button"
                    className="ls-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="ls-slot" aria-live="polite">
                  {capsLock ? (
                    <p className="ls-caps" id="login-caps" role="status">
                      Caps Lock is on
                    </p>
                  ) : passwordError ? (
                    <p className="ls-error" id="login-password-error">
                      {passwordError}
                    </p>
                  ) : null}
                </div>
              </div>

              <button type="submit" className="ls-submit" disabled={login.isPending}>
                {login.isPending ? <span className="ls-spinner" aria-hidden="true" /> : null}
                {login.isPending ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <aside className="ls-help">
              <strong>Trouble signing in?</strong>
              Check that your email and password are correct, or ask your project manager to reset
              your account.
            </aside>
          </section>
        </div>
      </main>

      <footer className="ls-footer">
        <span>Human Resource and Organizational Development</span>
        <span>InsightED</span>
      </footer>
    </div>
  );
}
