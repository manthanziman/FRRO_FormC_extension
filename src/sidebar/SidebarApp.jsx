import { useMemo, useState } from "react";
import { fieldMap } from "../autofill/fieldMap";
import { transformers } from "../autofill/transformers";
import {
  BOOKING_QUERY,
  createGraphqlClient,
  LOGIN_MUTATION,
} from "../graphql/client";
import "./styles.css";

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab is available.");
  return chrome.tabs.sendMessage(tab.id, message);
}

function valueAtPath(path, guest, booking) {
  const [root, key] = path.split(".");
  return root === "guest" ? guest[key] : booking[key];
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function ManualInput({ field, value, options, onChange }) {
  if (field.type === "select") {
    return (
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select an option</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === "radio") {
    return (
      <div className="radio-options">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={`manual-${field.id}`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
        {!options.length && <span>Open the Form-C page to load its options.</span>}
      </div>
    );
  }
  return (
    <input
      type={field.type === "date" ? "date" : "text"}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function SidebarApp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState(null);
  const [reservationId, setReservationId] = useState("");
  const [booking, setBooking] = useState(null);
  const [manualValues, setManualValues] = useState({});
  const [inspection, setInspection] = useState(null);
  const [resultByGuest, setResultByGuest] = useState({});
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [loading, setLoading] = useState(false);

  const manualFields = useMemo(
    () => fieldMap.filter((field) => field.source.kind === "manual"),
    [],
  );

  async function inspectPage() {
    setPageError("");
    try {
      const response = await sendToActiveTab({ type: "inspectForm" });
      if (!response?.ok) throw new Error("The Form-C page did not return field details.");
      setInspection(response.fields);
      return response.fields;
    } catch (requestError) {
      setPageError(requestError.message || "Could not inspect the active page.");
      return null;
    }
  }

  async function loadBooking(event) {
    event.preventDefault();
    setError("");
    setBooking(null);
    setInspection(null);
    setResultByGuest({});
    setManualValues({});
    setLoading(true);
    try {
      const client = createGraphqlClient(auth.token);
      const { data } = await client.query({
        query: BOOKING_QUERY,
        variables: { reservationId },
        fetchPolicy: "no-cache",
      });
      if (!data?.bookingByReservationId) {
        throw new Error("No booking was returned for that reservation ID.");
      }
      setBooking(data.bookingByReservationId);
      await inspectPage();
    } catch (requestError) {
      setError(requestError.message || "Could not load the booking.");
    } finally {
      setLoading(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    setError("");
    setBooking(null);
    setLoading(true);
    try {
      const client = createGraphqlClient();
      const { data } = await client.mutate({
        mutation: LOGIN_MUTATION,
        variables: { email, password },
      });
      const loginResult = data?.loginAdmin;
      if (!loginResult?.token || !loginResult.user) {
        throw new Error("The server returned an incomplete login response.");
      }
      setAuth({ token: loginResult.token, user: loginResult.user });
      setPassword("");
    } catch (requestError) {
      setError(requestError.message || "Could not log in.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setAuth(null);
    setEmail("");
    setPassword("");
    setBooking(null);
    setManualValues({});
    setInspection(null);
    setResultByGuest({});
    setError("");
  }

  function updateManualValue(guestId, fieldId, value) {
    setResultByGuest((current) => {
      const next = { ...current };
      delete next[guestId];
      return next;
    });
    setManualValues((current) => ({
      ...current,
      [guestId]: { ...current[guestId], [fieldId]: value },
    }));
  }

  function missingRequired(guest) {
    if (!inspection) return [];
    return fieldMap
      .filter((field) => inspection[field.id]?.required)
      .filter((field) => inspection[field.id]?.empty)
      .filter((field) => {
        const value = field.source.kind === "manual"
          ? manualValues[guest.id]?.[field.id]
          : valueAtPath(field.source.path, guest, booking);
        return isBlank(value);
      })
      .map((field) => field.label);
  }

  function unavailableRequired() {
    if (!inspection) return [];
    return fieldMap
      .filter((field) => !inspection[field.id]?.found)
      .map((field) => field.label);
  }

  async function fillGuest(guest) {
    setError("");
    const formDetails = await inspectPage();
    if (!formDetails) return;

    const manual = manualValues[guest.id] ?? {};
    const pending = [];
    for (const field of fieldMap) {
      const rawValue = field.source.kind === "manual"
        ? manual[field.id]
        : valueAtPath(field.source.path, guest, booking);
      if (isBlank(rawValue)) {
        pending.push({ id: field.id, label: field.label, value: "" });
        continue;
      }

      const pageField = formDetails[field.id];
      if (!pageField?.found) {
        pending.push({ id: field.id, label: field.label, value: rawValue });
        continue;
      }
      let value = rawValue;
      if (field.transform) {
        const transform = transformers[field.transform];
        value = transform(rawValue, {
          options: pageField?.options ?? [],
          inputType: pageField?.inputType ?? field.type,
        });
      }
      if (value === null) {
        pending.push({ id: field.id, label: field.label, value: "", needsReview: true });
        continue;
      }
      pending.push({ id: field.id, label: field.label, value });
    }

    try {
      const response = await sendToActiveTab({ type: "autofill", fields: pending });
      if (!response?.ok) throw new Error("The Form-C page did not complete autofill.");
      setResultByGuest((current) => ({
        ...current,
        [guest.id]: response.result,
      }));
    } catch (requestError) {
      setError(requestError.message || "Could not autofill the active page.");
    }
  }

  return (
    <main>
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">FC</div>
        <div className="brand-copy">
          <p className="eyebrow">FRRO / FORM-C</p>
          <h1>Form-C Autofill</h1>
        </div>
      </header>
      {!auth ? (
        <form className="booking-form" onSubmit={login}>
          <div className="section-heading">
            <h2>Welcome back</h2>
            <p>Sign in to find a reservation and autofill the Form-C.</p>
          </div>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <>
          <div className="account-bar">
            <div className="account-copy">
              <span className="eyebrow">SIGNED IN AS</span>
              <strong>{auth.user.name}</strong>
              <span className="muted">{auth.user.role}</span>
            </div>
            <button className="button-secondary" type="button" onClick={logout}>Sign out</button>
          </div>
          <form className="booking-form" onSubmit={loadBooking}>
            <div className="section-heading">
              <h2>Find a booking</h2>
              <p>Enter the reservation ID to load its guest details.</p>
            </div>
            <label>
              Reservation ID
              <input
                value={reservationId}
                onChange={(event) => setReservationId(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Loading…" : "Load booking"}
            </button>
          </form>
        </>
      )}

      {error && <p className="message" role="alert">{error}</p>}
      {pageError && (
        <p className="message" role="status">
          {pageError} Reload the Form-C tab and try again.
        </p>
      )}

      {auth && booking?.customers?.map((guest) => {
        const missing = missingRequired(guest);
        const unavailable = unavailableRequired();
        const guestManualValues = manualValues[guest.id] ?? {};
        const result = resultByGuest[guest.id];
        return (
          <article className="guest-card" key={guest.id}>
            <div className="guest-heading">
              <div className="guest-avatar" aria-hidden="true">
                {guest.firstName?.charAt(0)?.toUpperCase() || "G"}
              </div>
              <div className="guest-identity">
                <h2>{[guest.firstName, guest.lastName].filter(Boolean).join(" ") || "Guest"}</h2>
                <p className="muted">{guest.email || "Guest details"}</p>
              </div>
            </div>
            {inspection && (
              <p
                className={`required-status ${
                  missing.length || unavailable.length ? "status-warning" : "status-success"
                }`}
              >
                {missing.length
                  ? `${missing.length} required field${missing.length === 1 ? "" : "s"} missing: ${missing.join(", ")}`
                  : unavailable.length
                    ? "No missing required fields were found among the fields matched on the page."
                    : "No required data is missing from this guest and the current manual details."}
              </p>
            )}
            {unavailable.length > 0 && (
              <p className="required-status">
                Required status unavailable for fields not found on the page: {unavailable.join(", ")}
              </p>
            )}

            <details>
              <summary>Additional details</summary>
              <div className="manual-fields">
                {manualFields.map((field) => {
                  const options = inspection?.[field.id]?.options ?? [];
                  return (
                    <label className="manual-field" key={field.id}>
                      {field.label}
                      <ManualInput
                        field={field}
                        value={guestManualValues[field.id]}
                        options={options}
                        onChange={(value) => updateManualValue(guest.id, field.id, value)}
                      />
                      {["select", "radio"].includes(field.type) && !options.length && (
                        <small>Options are read from the open Form-C page.</small>
                      )}
                    </label>
                  );
                })}
              </div>
            </details>

            <button type="button" onClick={() => fillGuest(guest)}>
              Autofill this guest
            </button>
            {result && (
              <section className="result" aria-live="polite">
                <h3>Autofill result</h3>
                <p><strong>Filled ({result.filled.length})</strong></p>
                <p><strong>Skipped, no data ({result.skippedNoData.length})</strong></p>
                {result.skippedNoData.length > 0 && <p>{result.skippedNoData.join(", ")}</p>}
                <p><strong>Failed, selector/option not found on page ({result.failed.length})</strong></p>
                {result.failed.length > 0 && <p>{result.failed.join(", ")}</p>}
                {result.needsReview.length > 0 && (
                  <>
                    <p><strong>Needs review ({result.needsReview.length})</strong></p>
                    <p>{result.needsReview.join(", ")}</p>
                  </>
                )}
              </section>
            )}
          </article>
        );
      })}
    </main>
  );
}
