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

const skillForm = document.querySelector("#skill-form");
const skillText = document.querySelector("#skill-request-text");
const skillRunButton = document.querySelector("#skill-run-button");
const skillStatus = document.querySelector("#skill-status");
const skillResult = document.querySelector("#skill-result");
const skillResultMeta = document.querySelector("#skill-result-meta");
const skillCitations = document.querySelector("#skill-citations");
const skillCitationList = document.querySelector("#skill-citation-list");
const attachmentList = document.querySelector("#attachment-list");
const addAttachmentButton = document.querySelector("#add-attachment");
const skillLabels = {
  DOCUMENT_UNDERSTANDING: "Dokumente verstehen",
  TEXT_COMPOSITION: "Texte formulieren",
};
let attachmentNumber = 0;
let skillBusy = false;
let activeSkillNonce = null;
let skillController = null;

function setSkillStatus(message, kind = "") {
  skillStatus.textContent = message;
  skillStatus.className = `status ${kind}`.trim();
}

function newNonce() {
  return `p7_${crypto.randomUUID().replaceAll("-", "_")}`;
}

function invalidateSkillResult() {
  if (skillBusy) {
    activeSkillNonce = null;
    skillController?.abort();
  }
}

function addAttachment() {
  invalidateSkillResult();
  if (attachmentList.childElementCount >= 4) {
    setSkillStatus("At most four text attachments are supported", "error");
    return;
  }
  attachmentNumber += 1;
  const card = document.createElement("section");
  card.className = "attachment-card";
  const header = document.createElement("div");
  header.className = "attachment-card-header";
  const selectedLabel = document.createElement("label");
  const selected = document.createElement("input");
  selected.type = "checkbox";
  selected.className = "attachment-selected";
  selected.checked = true;
  selectedLabel.append(selected, document.createTextNode(` Use attachment ${attachmentNumber}`));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-attachment";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => { card.remove(); invalidateSkillResult(); });
  header.append(selectedLabel, remove);
  const titleLabel = document.createElement("label");
  titleLabel.textContent = "Display title";
  const title = document.createElement("input");
  title.type = "text";
  title.className = "attachment-title";
  title.maxLength = 128;
  title.value = `Synthetic text ${attachmentNumber}`;
  titleLabel.append(title);
  const bodyLabel = document.createElement("label");
  bodyLabel.textContent = "Plain text";
  const body = document.createElement("textarea");
  body.className = "attachment-text";
  body.maxLength = 12288;
  body.rows = 5;
  body.placeholder = "Paste synthetic plain text. Blank lines create host paragraph references.";
  bodyLabel.append(body);
  card.append(header, titleLabel, bodyLabel);
  attachmentList.append(card);
  body.focus();
}

function selectedAttachments() {
  const attachments = [];
  for (const card of attachmentList.querySelectorAll(".attachment-card")) {
    if (!card.querySelector(".attachment-selected").checked) continue;
    const title = card.querySelector(".attachment-title").value.trim();
    const attachmentText = card.querySelector(".attachment-text").value;
    if (!title || !attachmentText.trim()) throw new Error("incomplete_attachment");
    attachments.push({ title, text: attachmentText });
  }
  return attachments;
}

function renderSkillResult(payload) {
  skillResult.replaceChildren();
  skillResult.className = payload.ok ? "result" : "result blocked";
  skillResultMeta.replaceChildren();
  skillCitationList.replaceChildren();
  if (payload.ok) {
    const values = [
      `Applied skills: ${(payload.skillIds ?? []).map((id) => skillLabels[id] ?? id).join(" + ")}`,
      `Runtime: ${payload.provider}`,
      `Result parts: ${(payload.parts ?? []).map((part) => part.resultKind === "draft" ? "editable draft" : "local answer").join(" + ")}`,
      `Selected sources: ${(payload.sourceTitles ?? []).join(", ") || "none"}`,
    ];
    for (const value of values) {
      const item = document.createElement("span");
      item.textContent = value;
      skillResultMeta.append(item);
    }
    skillResultMeta.hidden = false;
    for (const [index, part] of (payload.parts ?? []).entries()) {
      if (part.resultKind === "draft") {
        const label = document.createElement("label");
        label.textContent = `Bearbeitbarer Entwurf ${index + 1}`;
        const editor = document.createElement("textarea");
        editor.className = "editable-draft";
        editor.rows = 9;
        editor.value = part.text;
        label.append(editor);
        skillResult.append(label);
      } else {
        const answer = document.createElement("p");
        answer.textContent = part.text;
        skillResult.append(answer);
      }
    }
    if (!(payload.parts ?? []).length) skillResult.textContent = payload.message;
  } else {
    skillResultMeta.hidden = true;
    skillResult.textContent = payload.message;
  }
  for (const citation of payload.citations ?? []) {
    const item = document.createElement("li");
    item.textContent = `${citation.sourceTitle} · ${citation.sectionLabel} · ${citation.paragraphLabel} (${citation.paragraphId})`;
    skillCitationList.append(item);
  }
  skillCitations.hidden = skillCitationList.childElementCount === 0;
  skillResult.focus();
}

addAttachmentButton.addEventListener("click", addAttachment);
skillForm.addEventListener("input", invalidateSkillResult);
skillForm.addEventListener("change", invalidateSkillResult);
skillForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (skillBusy) return;
  let attachments;
  try {
    attachments = selectedAttachments();
  } catch {
    setSkillStatus("Complete or deselect every selected attachment", "error");
    return;
  }
  const requestNonce = newNonce();
  activeSkillNonce = requestNonce;
  skillBusy = true;
  skillController = new AbortController();
  skillRunButton.disabled = true;
  skillForm.setAttribute("aria-busy", "true");
  setSkillStatus("Checking host scope and local skill…", "busy");
  try {
    const response = await fetch("/api/local-skills/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestNonce, text: skillText.value, attachments }),
      signal: skillController.signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error("request_failed");
    if (activeSkillNonce !== requestNonce || payload.requestNonce !== requestNonce) return;
    renderSkillResult(payload);
    setSkillStatus(payload.ok ? "Mechanical local test completed" : "More information is needed", payload.ok ? "" : "error");
  } catch {
    if (activeSkillNonce !== requestNonce) return;
    skillResult.textContent = "The mechanical local test could not be completed. Your text remains in the form.";
    skillResult.className = "result error";
    skillResultMeta.hidden = true;
    skillCitations.hidden = true;
    setSkillStatus("Could not complete the local test", "error");
    skillResult.focus();
  } finally {
    skillBusy = false;
    skillController = null;
    skillRunButton.disabled = false;
    skillForm.removeAttribute("aria-busy");
  }
});
skillText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) skillForm.requestSubmit();
});

const workingTimeForm = document.querySelector("#working-time-form");
const workingTimeText = document.querySelector("#working-time-text");
const workingTimeFields = document.querySelector("#working-time-fields");
const workingTimePerson = document.querySelector("#working-time-person");
const workingTimeHours = document.querySelector("#working-time-hours");
const workingTimeDate = document.querySelector("#working-time-date");
const workingTimeResearch = document.querySelector("#working-time-research");
const workingTimeTemplate = document.querySelector("#working-time-template");
const workingTimeConfirm = document.querySelector("#working-time-confirm");
const workingTimeQuestions = document.querySelector("#working-time-questions");
const workingTimeRunButton = document.querySelector("#working-time-run-button");
const workingTimeStatus = document.querySelector("#working-time-status");
const workingTimeEmpty = document.querySelector("#working-time-empty");
const workingTimeResult = document.querySelector("#working-time-result");
const workingTimeDraft = document.querySelector("#working-time-draft");
const workingTimeGaps = document.querySelector("#working-time-gaps");
const workingTimeReviewNotes = document.querySelector("#working-time-review-notes");
const workingTimeCitations = document.querySelector("#working-time-citations");
const workingTimeResearchLabel = document.querySelector("#working-time-research-label");
const workingTimeTemplateLabel = document.querySelector("#working-time-template-label");
let workingTimeRevision = 1;
let workingTimeBusy = false;
let workingTimeNonce = null;
let workingTimeController = null;
let workingTimeDraftEditRevision = 0;

function setWorkingTimeStatus(message, kind = "") {
  workingTimeStatus.textContent = message;
  workingTimeStatus.className = `status ${kind}`.trim();
}

function invalidateWorkingTimeRequest() {
  workingTimeRevision += 1;
  workingTimeConfirm.checked = false;
  if (workingTimeBusy) {
    workingTimeNonce = null;
    workingTimeController?.abort();
  }
  setWorkingTimeStatus("Eingabe geändert – bitte erneut prüfen und bestätigen");
}

function workingTimeIntent() {
  const hours = workingTimeHours.value === "" ? null : Number(workingTimeHours.value);
  return {
    personId: workingTimePerson.value || null,
    targetWeeklyHours: hours,
    effectiveDate: workingTimeDate.value || null,
    researchRequested: workingTimeResearch.value === "" ? null : workingTimeResearch.value === "true",
    templateRequested: workingTimeTemplate.value === "" ? null : workingTimeTemplate.value === "true",
  };
}

function renderList(element, values) {
  element.replaceChildren();
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    element.append(item);
  }
  if (values.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Keine angegeben.";
    element.append(item);
  }
}

function showWorkingTimeClarification(payload) {
  workingTimeFields.hidden = false;
  workingTimeQuestions.hidden = false;
  if (payload.proposedIntent.personId !== null) workingTimePerson.value = payload.proposedIntent.personId;
  if (payload.proposedIntent.targetWeeklyHours !== null) workingTimeHours.value = String(payload.proposedIntent.targetWeeklyHours);
  if (payload.proposedIntent.effectiveDate !== null) workingTimeDate.value = payload.proposedIntent.effectiveDate;
  if (payload.proposedIntent.researchRequested !== null) workingTimeResearch.value = String(payload.proposedIntent.researchRequested);
  if (payload.proposedIntent.templateRequested !== null) workingTimeTemplate.value = String(payload.proposedIntent.templateRequested);
  workingTimeQuestions.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = "Bitte noch bestätigen:";
  const list = document.createElement("ul");
  renderList(list, payload.questions);
  workingTimeQuestions.append(heading, list);
  workingTimeConfirm.checked = false;
  workingTimeRunButton.textContent = "Bestätigten Entwurf erstellen";
}

function showWorkingTimeDraft(payload) {
  workingTimeEmpty.hidden = true;
  workingTimeResult.hidden = false;
  workingTimeQuestions.replaceChildren();
  workingTimeQuestions.hidden = true;
  workingTimeDraft.value = payload.draft;
  renderList(workingTimeGaps, payload.gaps ?? []);
  renderList(workingTimeReviewNotes, payload.reviewNotes ?? []);
  renderList(workingTimeCitations, payload.citations ?? []);
  workingTimeResearchLabel.hidden = !payload.researchUsed;
  workingTimeResearchLabel.textContent = payload.researchLabel ?? "";
  workingTimeTemplateLabel.textContent = payload.templateLabel;
  workingTimeDraft.focus();
}

function handleWorkingTimeFormChange(event) {
  if (event.target === workingTimeConfirm) {
    if (!workingTimeConfirm.checked) invalidateWorkingTimeRequest();
    return;
  }
  invalidateWorkingTimeRequest();
}
workingTimeForm.addEventListener("input", handleWorkingTimeFormChange);
workingTimeForm.addEventListener("change", handleWorkingTimeFormChange);
workingTimeDraft.addEventListener("input", () => {
  workingTimeDraftEditRevision += 1;
});
workingTimeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (workingTimeBusy) return;
  const intent = workingTimeIntent();
  let confirmation = null;
  if (!workingTimeFields.hidden) {
    if (Object.values(intent).some((value) => value === null)) {
      setWorkingTimeStatus("Bitte Person, Wochenstunden, Datum, Referenz- und Vorlagenwunsch vollständig angeben", "error");
      return;
    }
    if (!workingTimeConfirm.checked) {
      setWorkingTimeStatus("Bitte die aktuellen Angaben ausdrücklich bestätigen", "error");
      return;
    }
    confirmation = { ...intent, revision: workingTimeRevision, text: workingTimeText.value };
  }
  const requestNonce = `p8_${crypto.randomUUID().replaceAll("-", "_")}`;
  const revision = workingTimeRevision;
  const draftEditRevision = workingTimeDraftEditRevision;
  workingTimeNonce = requestNonce;
  workingTimeController = new AbortController();
  workingTimeBusy = true;
  workingTimeRunButton.disabled = true;
  workingTimeForm.setAttribute("aria-busy", "true");
  setWorkingTimeStatus(confirmation === null ? "Auftrag wird lokal verstanden…" : "Entwurf wird lokal erstellt…", "busy");
  try {
    const response = await fetch("/api/working-time/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestNonce, revision, text: workingTimeText.value, intent: confirmation === null ? { personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: null, templateRequested: null } : intent, confirmation }),
      signal: workingTimeController.signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error("request_failed");
    if (workingTimeNonce !== requestNonce || payload.requestNonce !== requestNonce || payload.revision !== revision || workingTimeRevision !== revision) return;
    if (!payload.ok) {
      setWorkingTimeStatus(payload.message, "error");
      return;
    }
    if (payload.kind === "clarification") {
      showWorkingTimeClarification(payload);
      setWorkingTimeStatus("Fehlende Angaben ergänzen und bewusst bestätigen");
    } else {
      if (workingTimeDraftEditRevision !== draftEditRevision) {
        setWorkingTimeStatus("Der vorhandene Entwurf wurde während der Anfrage bearbeitet. Die neue Antwort wurde deshalb nicht übernommen.", "error");
        return;
      }
      showWorkingTimeDraft(payload);
      setWorkingTimeStatus("Unverbindlicher Entwurf erstellt");
    }
  } catch {
    if (workingTimeNonce !== requestNonce) return;
    setWorkingTimeStatus("Der lokale Pilot konnte den Auftrag nicht abschließen. Deine Eingaben bleiben erhalten.", "error");
  } finally {
    workingTimeBusy = false;
    workingTimeController = null;
    workingTimeRunButton.disabled = false;
    workingTimeForm.removeAttribute("aria-busy");
  }
});
