import { useEffect, useMemo, useRef, useState } from "react";
import { fieldMap } from "../autofill/fieldMap";
import { transformers } from "../autofill/transformers";
import {
  BOOKING_QUERY,
  client,
  LOGOUT_MUTATION,
  ME_QUERY,
  isAuthenticationError,
  isForbiddenError,
  onForbidden,
} from "../graphql/client";
import { GO_ORIGIN } from "../config.js";
import { useAuth, useIdle } from "./useExtensionState.js";
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
  const isAuthenticated = useAuth();
  const isIdle = useIdle();
  const [panelVisible, setPanelVisible] = useState(() => !document.hidden);
  const [user, setUser] = useState(null);
  const [reservationId, setReservationId] = useState("");
  const [booking, setBooking] = useState(null);
  const [manualValues, setManualValues] = useState({});
  const [inspection, setInspection] = useState(null);
  const [resultByGuest, setResultByGuest] = useState({});
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const requestVersion = useRef(0);
  const bookingAbortController = useRef(null);

  function clearGuestData(clearReservation = true) {
    if (clearReservation) setReservationId("");
    setBooking(null);
    setManualValues({});
    setInspection(null);
    setResultByGuest({});
    setError("");
    setPageError("");
    setLoading(false);
  }

  const manualFields = useMemo(
    () => fieldMap.filter((field) => field.source.kind === "manual"),
    [],
  );

  useEffect(() => {
    return onForbidden(() => setForbidden(true));
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setPanelVisible(visible);
      if (!visible) return;

      setAuthLoading(true);
      setUser(null);
      clearGuestData(false);
      void client.clearStore().catch(() => {
        setError("Could not clear private session data before reopening the panel.");
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (isAuthenticated !== false) return;
    requestVersion.current += 1;
    bookingAbortController.current?.abort();
    bookingAbortController.current = null;
    setUser(null);
    setForbidden(false);
    clearGuestData();
    void client.clearStore().catch(() => {
      setError("Could not clear private session data. Close and reopen the side panel.");
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (isIdle !== true) return;
    requestVersion.current += 1;
    bookingAbortController.current?.abort();
    bookingAbortController.current = null;
    setUser(null);
    setForbidden(false);
    clearGuestData(false);
    setAuthLoading(true);
    void client.clearStore().catch(() => {
      setError("Could not clear private session data while idle.");
    });
  }, [isIdle]);

  useEffect(() => {
    if (isAuthenticated !== true || isIdle !== false || !panelVisible) {
      if (isAuthenticated !== true || isIdle !== false) setAuthLoading(false);
      return undefined;
    }

    let active = true;
    const abortController = new AbortController();

    async function validateSession() {
      setAuthLoading(true);
      setError("");
      setForbidden(false);
      try {
        const { data } = await client.query({
          query: ME_QUERY,
          fetchPolicy: "network-only",
          context: { fetchOptions: { signal: abortController.signal } },
        });
        if (!active) return;
        if (!data?.me) throw new Error("The server returned no current user.");
        setUser(data.me);

        if (reservationId) {
          const bookingResult = await client.query({
            query: BOOKING_QUERY,
            variables: { reservationId },
            fetchPolicy: "network-only",
            context: { fetchOptions: { signal: abortController.signal } },
          });
          if (!active) return;
          if (!bookingResult.data?.bookingByReservationId) {
            throw new Error("No booking was returned for that reservation ID.");
          }
          setBooking(bookingResult.data.bookingByReservationId);
        }
      } catch (requestError) {
        if (!active) return;
        if (abortController.signal.aborted) return;
        if (isForbiddenError(requestError)) setForbidden(true);
        else if (!isAuthenticationError(requestError)) {
          setError(requestError.message || "Could not restore the session.");
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    }

    void validateSession();

    return () => {
      active = false;
      abortController.abort();
    };
  }, [isAuthenticated, isIdle, panelVisible]);

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
    if (isAuthenticated !== true || isIdle) return;
    const currentRequestVersion = requestVersion.current;
    const abortController = new AbortController();
    bookingAbortController.current?.abort();
    bookingAbortController.current = abortController;
    setError("");
    setForbidden(false);
    setBooking(null);
    setInspection(null);
    setResultByGuest({});
    setManualValues({});
    setLoading(true);
    try {
      const { data } = await client.query({
        query: BOOKING_QUERY,
        variables: { reservationId },
        fetchPolicy: "network-only",
        context: { fetchOptions: { signal: abortController.signal } },
      });
      if (currentRequestVersion !== requestVersion.current) return;
      if (!data?.bookingByReservationId) {
        throw new Error("No booking was returned for that reservation ID.");
      }
      setBooking(data.bookingByReservationId);
      await inspectPage();
    } catch (requestError) {
      if (abortController.signal.aborted) return;
      if (isForbiddenError(requestError)) setForbidden(true);
      else if (!isAuthenticationError(requestError)) {
        setError(requestError.message || "Could not load the booking.");
      }
    } finally {
      if (bookingAbortController.current === abortController) {
        bookingAbortController.current = null;
        setLoading(false);
      }
    }
  }

  async function logout() {
    setError("");
    setLoading(true);
    try {
      const { data } = await client.mutate({ mutation: LOGOUT_MUTATION });
      if (!data?.logout) throw new Error("The server could not end the session.");

      await chrome.storage.session.set({ isAuthenticated: false });
    } catch (requestError) {
      if (isForbiddenError(requestError)) setForbidden(true);
      else if (!isAuthenticationError(requestError)) {
        setError(requestError.message || "Could not log out.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function openGo() {
    try {
      await chrome.tabs.create({ url: GO_ORIGIN });
    } catch {
      setError("Could not open the GO dashboard.");
    }
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
    if (isAuthenticated !== true || isIdle) return;
    const currentRequestVersion = requestVersion.current;
    setError("");
    const formDetails = await inspectPage();
    if (!formDetails || currentRequestVersion !== requestVersion.current) return;

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
      if (currentRequestVersion !== requestVersion.current) return;
      const response = await sendToActiveTab({ type: "autofill", fields: pending });
      if (currentRequestVersion !== requestVersion.current) return;
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
      {isAuthenticated === null || isIdle === null ? (
        <section className="booking-form" role="status">
          Checking extension session…
        </section>
      ) : isIdle ? (
        <section className="booking-form" role="status">
          <h2>Session locked</h2>
          <p>Guest details were cleared while this device was idle. Return to active use to continue.</p>
        </section>
      ) : isAuthenticated === false ? (
        <section className="booking-form">
          <div className="section-heading">
            <h2>Please log in to GO</h2>
            <p>Sign in to the GO dashboard to access Form-C bookings.</p>
          </div>
          <button type="button" onClick={openGo}>
            Open GO dashboard
          </button>
        </section>
      ) : authLoading ? (
        <section className="booking-form" role="status">
          Revalidating GO session…
        </section>
      ) : forbidden ? (
        <section className="booking-form" role="alert">
          <h2>No permission</h2>
          <p>Your GO account does not have permission to access FRRO bookings.</p>
        </section>
      ) : (
        <>
          <div className="account-bar">
            <div className="account-copy">
              <span className="eyebrow">SIGNED IN AS</span>
              <strong>{user?.name}</strong>
              <span className="muted">{user?.roles?.join(", ")}</span>
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

      {isAuthenticated === true && isIdle === false && !authLoading && !forbidden &&
        booking?.customers?.map((guest) => {
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
