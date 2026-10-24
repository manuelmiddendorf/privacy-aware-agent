const form = document.querySelector("#agent-form");
const text = document.querySelector("#request-text");
const runButton = document.querySelector("#run-button");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const citations = document.querySelector("#citations");
const citationList = document.querySelector("#citation-list");
const templates = {
  "demo-a": { task: "ask", text: "List only the approved preparation steps for the synthetic board meeting.", sourceIds: ["meeting-preparation"] },
  p01: { task: "ask", text: "Which preparation step comes after creating the agenda, and what is the final step? Answer only from the approved page.", sourceIds: ["meeting-preparation"] },
};
let activeTemplate = null;
let busy = false;

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}
function invalidateTemplate() { activeTemplate = null; }
function renderResult(payload) {
  result.textContent = payload.message;
  result.className = payload.ok ? "result" : "result blocked";
  citationList.replaceChildren();
  for (const citation of payload.citations ?? []) {
    const item = document.createElement("li");
    item.textContent = citation;
    citationList.append(item);
  }
  citations.hidden = citationList.childElementCount === 0;
  result.focus();
}
function loadTemplate(id) {
  const template = templates[id];
  if (!template) return;
  form.elements.task.value = template.task;
  text.value = template.text;
  for (const checkbox of form.querySelectorAll('input[name="source"]')) checkbox.checked = template.sourceIds.includes(checkbox.value);
  activeTemplate = id;
  setStatus("Approved synthetic template loaded");
  text.focus();
}
for (const button of document.querySelectorAll("[data-template]")) button.addEventListener("click", () => loadTemplate(button.dataset.template));
form.addEventListener("input", invalidateTemplate);
form.addEventListener("change", invalidateTemplate);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  runButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  setStatus("Checking locally…", "busy");
  const body = activeTemplate ? { templateId: activeTemplate } : {
    task: form.elements.task.value,
    text: text.value,
    sourceIds: [...form.querySelectorAll('input[name="source"]:checked')].map((input) => input.value),
  };
  try {
    const response = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error("request_failed");
    renderResult(payload);
    setStatus(payload.ok ? "Completed offline" : "Blocked safely", payload.ok ? "" : "error");
  } catch {
    result.textContent = "The local offline request could not be completed. Your input is still available above.";
    result.className = "result error";
    citations.hidden = true;
    setStatus("Could not complete the request", "error");
    result.focus();
  } finally {
    busy = false;
    runButton.disabled = false;
    form.removeAttribute("aria-busy");
  }
});
text.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) form.requestSubmit();
});
