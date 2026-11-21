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
import {
  AnchorIcon,
  CompassRoseIcon,
  NauticalWatermark,
  PirateFlagIcon,
  SailboatIcon,
  ShipsHelmIcon,
} from "../components/PirateIcons";

/** Field messages; the shared schema stays the source of truth for what a valid email is. */
export function validateEmail(value: string): string | null {
  if (!value.trim()) return "Enter your email address";
  return loginSchema.shape.email.safeParse(value).success ? null : "Enter a valid email address";
}
export const validatePassword = (value: string): string | null =>
  value ? null : "Enter your password";

const LOGOS: Array<{ name: string; alt: string; src?: string }> = [
  { name: "InsightED Team", alt: "InsightED Team logo" },
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
      <NauticalWatermark style={{ top: -40, right: -40, zIndex: 0 }}>
        <CompassRoseIcon size={260} />
      </NauticalWatermark>
      <NauticalWatermark style={{ bottom: -30, left: -30, zIndex: 0 }}>
        <ShipsHelmIcon size={220} />
      </NauticalWatermark>

      <header className="ls-top">
        <span className="ls-pill ls-in" style={delay(0)}>
          <PirateFlagIcon size={13} />
          Fair winds · Portal ready
        </span>
        <div className="ls-dock ls-in" style={delay(80)}>
          {LOGOS.map((l) => (
            <span key={l.name} className="ls-chip" style={{ display: "inline-flex", gap: 6 }}>
              <CompassRoseIcon size={15} style={{ color: "var(--lp-sunshine)" }} />
              {l.src ? <img src={l.src} alt={l.alt} /> : l.name}
            </span>
          ))}
        </div>
      </header>

      <main className="ls-main">
        <section aria-label="About LogPose">
          <div className="ls-eyebrow ls-in" style={delay(120)}>
            <SailboatIcon size={14} />
            InsightED Team · Crew Deck
          </div>
          <span className="ls-bar ls-in" style={delay(160)} aria-hidden="true" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "nowrap" }}>
            <h1 className="ls-title ls-in" style={delay(200)}>
              LogPose
            </h1>
            <svg
              aria-hidden="true"
              width="92"
              height="92"
              viewBox="0 0 96 96"
              style={{ flexShrink: 0, marginBottom: 4 }}
            >
              <circle cx="52" cy="30" r="28" fill="#FFC857" />
              <path
                d="M46 38 L46 74 L24 74 Z"
                fill="#FF6B4A"
                stroke="#0B2545"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="M50 38 L50 74 L74 74 Z"
                fill="#FFFFFF"
                stroke="#0B2545"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path d="M22 77 L76 77 L68 86 L30 86 Z" fill="#0B2545" />
              <path
                d="M14 91 Q 26 87 38 91 T 62 91 T 84 91"
                fill="none"
                stroke="#13747D"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="ls-lede ls-in" style={delay(260)}>
            Plan sprints, track work and manage risks for your projects in one place.
          </p>
          <p
            className="ls-in"
            style={{
              ...delay(300),
              margin: "0 0 22px",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 24,
              color: "var(--lp-coral-text)",
            }}
          >
            Chart your course. Hoist the sails.
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
                  <span
                    className="ls-card-title"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    {i === 0 ? (
                      <CompassRoseIcon size={15} />
                    ) : i === 1 ? (
                      <ShipsHelmIcon size={15} />
                    ) : (
                      <AnchorIcon size={15} />
                    )}
                    {c.title}
                  </span>
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
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    marginBottom: 10,
                    borderRadius: 9999,
                    background: "#FFC857",
                    color: "#0B2545",
                    border: "1.5px solid #0B2545",
                    fontFamily: "var(--font-body)",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  <SailboatIcon size={13} />
                  Welcome aboard
                </span>
                <h2 className="ls-heading">Sign in</h2>
                <p className="ls-sub">Use your LogPose account.</p>
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
                  placeholder="name@insighted.team"
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
                {login.isPending ? (
                  <span className="ls-spinner" aria-hidden="true" />
                ) : (
                  <SailboatIcon size={16} />
                )}
                {login.isPending ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <aside className="ls-help">
              <ShipsHelmIcon size={22} className="ls-help-icon" />
              <div>
                <strong>Trouble signing in?</strong>{" "}
                Check that your email and password are correct, or ask your project manager to reset
                your account.
              </div>
            </aside>
          </section>
        </div>
      </main>

      {/* Layered nautical waves at bottom */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: 88,
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        <path d="M0 40 Q 240 0 480 35 T 960 30 T 1440 40 L 1440 120 L 0 120 Z" fill="#7CC6C1" />
        <path d="M0 62 Q 300 28 600 58 T 1200 50 T 1440 60 L 1440 120 L 0 120 Z" fill="#13747D" />
        <path d="M0 84 Q 360 56 720 82 T 1440 78 L 1440 120 L 0 120 Z" fill="#0B2545" />
      </svg>
      <footer className="ls-footer" style={{ position: "relative", zIndex: 1, color: "#FFFFFF" }}>
        <span>InsightED Team</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <CompassRoseIcon size={14} />
          InsightED
        </span>
      </footer>
    </div>
  );
}
