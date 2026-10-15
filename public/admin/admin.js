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
  const partnerRows = $("partnerRows");
  const partnerStatusMessage = $("partnerStatusMessage");

  const required = {
    loginPanel, dashboard, loginForm, loginMessage, loginButton, rows, statusEl,
    partnerRows, partnerStatusMessage,
    username: $("username"), password: $("password"), total: $("total"),
    customers: $("customers"), partners: $("partners"), today: $("today"),
    search: $("search"), typeFilter: $("typeFilter"),
    refreshButton: $("refreshButton"), exportButton: $("exportButton"),
    logoutButton: $("logoutButton"), refreshPartnersButton: $("refreshPartnersButton"),
    partnerSearch: $("partnerSearch"), partnerStatusFilter: $("partnerStatusFilter"),
    partnerTotal: $("partnerTotal"), partnerPending: $("partnerPending"),
    partnerActive: $("partnerActive"), partnerInactive: $("partnerInactive")
  };

  const missing = Object.entries(required).filter(([, element]) => !element).map(([id]) => id);
  if (missing.length) {
    console.error("LoansBazaar admin HTML is missing elements:", missing);
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="margin:16px;padding:16px;background:#fee2e2;color:#991b1b;border-radius:8px">Admin page version mismatch. Missing HTML elements: ' +
      missing.join(", ") + ". Please refresh or check the deployed HTML file.</div>");
    return;
  }

  let records = [];
  let partners = [];
  let loginInProgress = false;
  let partnerActionInProgress = false;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin", cache: "no-store", ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const responseText = await response.text();
    let data = {};
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch { throw new Error(`Server returned an unexpected response (${response.status}).`); }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
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
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function getFilteredRecords() {
    const query = $("search").value.trim().toLowerCase();
    const selectedType = $("typeFilter").value;
    return records.filter((record) => {
      const typeMatches = !selectedType || record.type === selectedType;
      const queryMatches = !query || [record.name, record.mobile, record.email, record.service, record.message]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
      return typeMatches && queryMatches;
    });
  }

  function renderEnquiries() {
    const filtered = getFilteredRecords();
    if (!filtered.length) {
      rows.innerHTML = '<tr><td colspan="9" class="empty">No enquiries found.</td></tr>';
    } else {
      rows.innerHTML = filtered.map((record) => `
        <tr>
          <td>${escapeHTML(record.id)}</td><td>${escapeHTML(record.created_at)}</td>
          <td>${escapeHTML(record.type)}</td><td>${escapeHTML(record.service)}</td>
          <td>${escapeHTML(record.name)}</td><td>${escapeHTML(record.age)}</td>
          <td>${escapeHTML(record.mobile)}</td><td>${escapeHTML(record.email)}</td>
          <td>${escapeHTML(record.message || "")}</td>
        </tr>`).join("");
    }
    statusEl.textContent = `Showing ${filtered.length} of ${records.length} enquiries`;
  }

  async function loadEnquiries() {
    statusEl.textContent = "Loading enquiries…";
    try {
      const data = await api("/api/admin/enquiries");
      records = Array.isArray(data.enquiries) ? data.enquiries : [];
      const stats = data.stats || {};
      $("total").textContent = stats.total ?? records.length;
      $("customers").textContent = stats.customers ?? records.filter((r) => r.type === "Customer").length;
      $("partners").textContent = stats.partners ?? records.filter((r) => r.type === "Partner").length;
      $("today").textContent = stats.today ?? "—";
      renderEnquiries();
      return true;
    } catch (error) {
      console.error("Unable to load enquiries:", error);
      if (/401|403|unauthorized/i.test(error.message)) {
        records = [];
        showLogin("Please sign in again to access the admin dashboard.");
        return false;
      }
      statusEl.textContent = error.message;
      return false;
    }
  }

  function getFilteredPartners() {
    const query = $("partnerSearch").value.trim().toLowerCase();
    const selectedStatus = $("partnerStatusFilter").value;
    return partners.filter((partner) => {
      const statusMatches = !selectedStatus || String(partner.status || "").toLowerCase() === selectedStatus;
      const queryMatches = !query || [
        partner.name, partner.partner_code, partner.mobile, partner.email, partner.id
      ].some((value) => String(value ?? "").toLowerCase().includes(query));
      return statusMatches && queryMatches;
    });
  }

  function statusPill(status) {
    const safeStatus = ["pending", "active", "inactive"].includes(String(status).toLowerCase())
      ? String(status).toLowerCase() : "pending";
    return `<span class="pill pill-${safeStatus}">${escapeHTML(safeStatus)}</span>`;
  }

  function renderPartners() {
    const filtered = getFilteredPartners();
    if (!filtered.length) {
      partnerRows.innerHTML = '<tr><td colspan="9" class="empty">No registered partners found.</td></tr>';
    } else {
      partnerRows.innerHTML = filtered.map((partner) => {
        const currentStatus = String(partner.status || "pending").toLowerCase();
        let actions = "";
        if (currentStatus !== "active") {
          actions += `<button class="action-button approve" type="button" data-partner-action="active" data-partner-id="${escapeHTML(partner.id)}">Approve</button>`;
        }
        if (currentStatus !== "inactive") {
          actions += `<button class="action-button suspend" type="button" data-partner-action="inactive" data-partner-id="${escapeHTML(partner.id)}">Suspend</button>`;
        }
        if (currentStatus !== "pending") {
          actions += `<button class="action-button pending" type="button" data-partner-action="pending" data-partner-id="${escapeHTML(partner.id)}">Set Pending</button>`;
        }
        return `<tr>
          <td>${escapeHTML(partner.id)}</td><td>${escapeHTML(partner.partner_code || "—")}</td>
          <td>${escapeHTML(partner.name)}</td><td>${escapeHTML(partner.age ?? "—")}</td>
          <td>${escapeHTML(partner.mobile)}</td><td>${escapeHTML(partner.email)}</td>
          <td>${escapeHTML(partner.created_at || "—")}</td><td>${statusPill(currentStatus)}</td>
          <td><div class="partner-actions">${actions || "No action available"}</div></td>
        </tr>`;
      }).join("");
    }
    partnerStatusMessage.textContent = `Showing ${filtered.length} of ${partners.length} registered partners.`;
  }

  async function loadPartners() {
    partnerStatusMessage.textContent = "Loading partners…";
    try {
      const data = await api("/api/admin/partners");
      partners = Array.isArray(data.partners) ? data.partners : [];
      const stats = data.stats || {};
      $("partnerTotal").textContent = stats.total ?? partners.length;
      $("partnerPending").textContent = stats.pending ?? partners.filter((p) => p.status === "pending").length;
      $("partnerActive").textContent = stats.active ?? partners.filter((p) => p.status === "active").length;
      $("partnerInactive").textContent = stats.inactive ?? partners.filter((p) => p.status === "inactive").length;
      renderPartners();
      return true;
    } catch (error) {
      console.error("Unable to load partners:", error);
      if (/401|403|unauthorized/i.test(error.message)) {
        partners = [];
        partnerRows.innerHTML = '<tr><td colspan="9" class="empty">Admin authentication expired. Please sign in again.</td></tr>';
        showLogin("Please sign in again to manage partners.");
        return false;
      }
      partnerStatusMessage.textContent = `Could not load partners: ${error.message}`;
      partnerRows.innerHTML = '<tr><td colspan="9" class="empty">Partner list could not be loaded. Check that the updated worker.js is deployed.</td></tr>';
      return false;
    }
  }

  async function updatePartnerStatus(id, nextStatus, button) {
    if (partnerActionInProgress) return;
    const partner = partners.find((item) => String(item.id) === String(id));
    if (!partner) {
      partnerStatusMessage.textContent = "Partner record not found. Refresh the list and try again.";
      return;
    }
    const actionLabel = nextStatus === "active" ? "approve" : nextStatus === "inactive" ? "suspend" : "set to pending";
    const confirmed = window.confirm(`Are you sure you want to ${actionLabel} ${partner.name || "this partner"}?`);
    if (!confirmed) return;

    partnerActionInProgress = true;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Saving…";
    partnerStatusMessage.textContent = `Updating ${partner.name || "partner"}…`;
    try {
      const data = await api("/api/admin/partners/status", {
        method: "POST",
        body: JSON.stringify({ id: Number(id), status: nextStatus })
      });
      if (!data.ok) throw new Error(data.error || "Partner status update failed.");
      partnerStatusMessage.textContent = data.message || `Partner status changed to ${nextStatus}.`;
      await loadPartners();
    } catch (error) {
      console.error("Partner status update failed:", error);
      partnerStatusMessage.textContent = `Could not update partner status: ${error.message}`;
      button.disabled = false;
      button.textContent = originalText;
    } finally {
      partnerActionInProgress = false;
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
        body: JSON.stringify({ username: $("username").value.trim(), password: $("password").value })
      });
      $("password").value = "";
      showDashboard();
      const results = await Promise.all([loadEnquiries(), loadPartners()]);
      if (results.some((loaded) => !loaded) && !dashboard.hidden) {
        // Individual sections display their own error messages.
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
    try { await api("/api/admin/logout", { method: "POST" }); }
    catch (error) { console.error("Logout request failed:", error); }
    records = [];
    partners = [];
    rows.innerHTML = "";
    partnerRows.innerHTML = "";
    loginForm.reset();
    showLogin("You have been logged out.");
  });

  $("refreshButton").addEventListener("click", loadEnquiries);
  $("refreshPartnersButton").addEventListener("click", loadPartners);
  $("search").addEventListener("input", renderEnquiries);
  $("typeFilter").addEventListener("change", renderEnquiries);
  $("partnerSearch").addEventListener("input", renderPartners);
  $("partnerStatusFilter").addEventListener("change", renderPartners);

  partnerRows.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-partner-action]");
    if (!button) return;
    updatePartnerStatus(button.dataset.partnerId, button.dataset.partnerAction, button);
  });

  $("exportButton").addEventListener("click", () => {
    const header = ["ID", "Date", "Type", "Service", "Name", "Age", "Mobile", "Email", "Message"];
    const csvCell = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const data = getFilteredRecords().map((record) => [
      record.id, record.created_at, record.type, record.service, record.name,
      record.age, record.mobile, record.email, record.message
    ]);
    const csv = [header, ...data].map((line) => line.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "loansbazaar-enquiries.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  // Start at login. All protected API calls happen after admin sign-in.
  showLogin();
}
