
"use strict";

document.addEventListener("DOMContentLoaded", initAdmin);

function initAdmin() {
  const $ = (id) => document.getElementById(id);

  const loginPanel = $("loginPanel");
  const dashboard = $("dashboard");
  const loginForm = $("loginForm");
  const loginMessage = $("loginMessage");
  const loginButton = $("loginButton");
  const rows = $("rows");
  const statusEl = $("status");

  // Stop with a useful error if HTML and JavaScript do not match.
  const required = {
    loginPanel,
    dashboard,
    loginForm,
    loginMessage,
    loginButton,
    rows,
    statusEl,
    username: $("username"),
    password: $("password"),
    total: $("total"),
    customers: $("customers"),
    partners: $("partners"),
    today: $("today"),
    search: $("search"),
    typeFilter: $("typeFilter"),
    refreshButton: $("refreshButton"),
    exportButton: $("exportButton"),
    logoutButton: $("logoutButton")
  };

  const missing = Object.entries(required)
    .filter(([, element]) => !element)
    .map(([id]) => id);

  if (missing.length) {
    console.error("LoansBazaar admin HTML is missing elements:", missing);
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div style="margin:16px;padding:16px;background:#fee2e2;color:#991b1b;border-radius:8px">' +
      "Admin page version mismatch. Missing HTML elements: " +
      missing.join(", ") +
      ". Please refresh or check the deployed HTML file.</div>"
    );
    return;
  }

  let records = [];
  let loginInProgress = false;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    const responseText = await response.text();
    let data = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(
        `Server returned an unexpected response (${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status}).`);
    }

    return data;
  }

  function showLogin(message = "") {
    dashboard.hidden = true;
    loginPanel.hidden = false;
    loginMessage.textContent = message;
  }

  function showDashboard() {
    loginPanel.hidden = true;
    dashboard.hidden = false;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function getFilteredRecords() {
    const query = $("search").value.trim().toLowerCase();
    const selectedType = $("typeFilter").value;

    return records.filter((record) => {
      const typeMatches =
        !selectedType || record.type === selectedType;

      const queryMatches =
        !query ||
        [
          record.name,
          record.mobile,
          record.email,
          record.service,
          record.message
        ].some((value) =>
          String(value ?? "").toLowerCase().includes(query)
        );

      return typeMatches && queryMatches;
    });
  }

  function render() {
    const filtered = getFilteredRecords();

    if (filtered.length === 0) {
      rows.innerHTML =
        '<tr><td colspan="9" class="empty">No enquiries found.</td></tr>';
    } else {
      rows.innerHTML = filtered.map((record) => `
        <tr>
          <td>${escapeHTML(record.id)}</td>
          <td>${escapeHTML(record.created_at)}</td>
          <td>${escapeHTML(record.type)}</td>
          <td>${escapeHTML(record.service)}</td>
          <td>${escapeHTML(record.name)}</td>
          <td>${escapeHTML(record.age)}</td>
          <td>${escapeHTML(record.mobile)}</td>
          <td>${escapeHTML(record.email)}</td>
          <td>${escapeHTML(record.message || "")}</td>
        </tr>
      `).join("");
    }

    statusEl.textContent =
      `Showing ${filtered.length} of ${records.length} enquiries`;
  }

  async function loadEnquiries() {
    statusEl.textContent = "Loading enquiries…";

    try {
      const data = await api("/api/admin/enquiries");
      records = Array.isArray(data.enquiries) ? data.enquiries : [];

      const stats = data.stats || {};

      $("total").textContent = stats.total ?? records.length;
      $("customers").textContent =
        stats.customers ??
        records.filter((r) => r.type === "Customer").length;
      $("partners").textContent =
        stats.partners ??
        records.filter((r) => r.type === "Partner").length;
      $("today").textContent = stats.today ?? "—";

      render();
      return true;
    } catch (error) {
      console.error("Unable to load enquiries:", error);

      if (/401|403|unauthorized/i.test(error.message)) {
        records = [];
        showLogin("Please sign in again to access enquiries.");
        return false;
      }

      statusEl.textContent = error.message;
      return false;
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (loginInProgress) return;
    loginInProgress = true;

    loginMessage.textContent = "";
    loginButton.disabled = true;
    loginButton.textContent = "Signing in…";

    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: $("username").value.trim(),
          password: $("password").value
        })
      });

      $("password").value = "";
      showDashboard();

      const loaded = await loadEnquiries();

      if (!loaded && !dashboard.hidden) {
        statusEl.textContent =
          "Login response received, but enquiries could not be loaded. Check the error above.";
      }
    } catch (error) {
      console.error("Admin login failed:", error);
      showLogin(error.message || "Unable to sign in. Please try again.");
    } finally {
      loginInProgress = false;
      loginButton.disabled = false;
      loginButton.textContent = "Sign In";
    }
  });

  $("logoutButton").addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout request failed:", error);
    }

    records = [];
    rows.innerHTML = "";
    loginForm.reset();
    showLogin("You have been logged out.");
  });

  $("refreshButton").addEventListener("click", loadEnquiries);
  $("search").addEventListener("input", render);
  $("typeFilter").addEventListener("change", render);

  $("exportButton").addEventListener("click", () => {
    const header = [
      "ID", "Date", "Type", "Service", "Name",
      "Age", "Mobile", "Email", "Message"
    ];

    const csvCell = (value) =>
      '"' + String(value ?? "").replace(/"/g, '""') + '"';

    const data = getFilteredRecords().map((record) => [
      record.id,
      record.created_at,
      record.type,
      record.service,
      record.name,
      record.age,
      record.mobile,
      record.email,
      record.message
    ]);

    const csv = [header, ...data]
      .map((line) => line.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "loansbazaar-enquiries.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  });

  // Start at login. The protected enquiries API is called after sign-in.
  showLogin();
}
