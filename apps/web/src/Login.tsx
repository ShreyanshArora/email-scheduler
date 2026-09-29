import { useState } from "react";
import { GoogleMark } from "./GoogleMark";
import { api } from "./shared";
export function Login({
  onLogin,
  initialError,
}: {
  onLogin: () => void;
  initialError: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, name, password }),
      });
      onLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <section className="login-card">
        <h1>{mode === "login" ? "Login" : "Create account"}</h1>
        <a className="google-button" href="/auth/google">
          <GoogleMark /> Login with Google
        </a>
        <div className="login-divider">
          <span>or sign up through email</span>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && (
            <input
              aria-label="Name"
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
            />
          )}
          <input
            type="email"
            aria-label="Email ID"
            placeholder="Email ID"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            aria-label="Password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === "register" ? 8 : 1}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="login-submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Login"
                : "Create account"}
          </button>
        </form>
        <button
          className="login-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Login"}
        </button>
      </section>
    </main>
  );
}
