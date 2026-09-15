const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const serviceModal = $("#serviceModal");
const formModal = $("#formModal");
const form = $("#enquiryForm");
const formType = $("#formType");
const formService = $("#formService");
const serviceDisplay = $("#serviceDisplay");
const formEyebrow = $("#formEyebrow");
const formTitle = $("#formTitle");
const formSubtitle = $("#formSubtitle");
const successBox = $("#successBox");

function openModal(el) {
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeModal(el) {
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  if (!serviceModal.classList.contains("open") && !formModal.classList.contains("open")) {
    document.body.style.overflow = "";
  }
}
function openCustomer(service = "") {
  if (service) openForm("Customer", service);
  else openModal(serviceModal);
}
function openForm(type, service = "") {
  form.reset();
  successBox.hidden = true;
  form.style.display = "block";
  formType.value = type;
  formService.value = service;
  serviceDisplay.value = service || "General Enquiry";
  if (type === "Partner") {
    formEyebrow.textContent = "PARTNER ENQUIRY";
    formTitle.textContent = "Let's build a partnership.";
    formSubtitle.textContent = "Share your details and our team will contact you about partnering with LoansBazaar.";
  } else {
    formEyebrow.textContent = "CUSTOMER ENQUIRY";
    formTitle.textContent = service ? `Enquire about ${service}.` : "Tell us a little about you.";
    formSubtitle.textContent = "Share your basic details and our team will get back to you.";
  }
  openModal(formModal);
}

$$(".customer-open").forEach(btn => btn.addEventListener("click", () => openCustomer()));
$$(".partner-open").forEach(btn => btn.addEventListener("click", () => openForm("Partner")));
$$(".customer-service").forEach(btn => btn.addEventListener("click", () => openCustomer(btn.dataset.service)));
$$(".modal-service").forEach(btn => btn.addEventListener("click", () => {
  closeModal(serviceModal);
  openForm("Customer", btn.dataset.service);
}));

$$(".close-modal").forEach(btn => btn.addEventListener("click", () => {
  closeModal(serviceModal);
  closeModal(formModal);
}));

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeModal(serviceModal);
    closeModal(formModal);
  }
});

const menuToggle = $("#menuToggle");
const nav = $("#nav");
menuToggle.addEventListener("click", () => nav.classList.toggle("show"));
$$(".nav a").forEach(a => a.addEventListener("click", () => nav.classList.remove("show")));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submit = $(".submit-btn");
  submit.disabled = true;
  submit.innerHTML = "Sending…";

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || result.saved !== true) {
      throw new Error(result.error || "Submission failed");
    }

    form.style.display = "none";
    successBox.hidden = false;
  } catch (error) {
    // Keeps the front end usable during local testing.
    // On Cloudflare, the API function handles the real notification.
    alert("We couldn't submit the enquiry right now. Please try again or contact our team directly.");
  } finally {
    submit.disabled = false;
    submit.innerHTML = "Submit Enquiry <span>→</span>";
  }
});
