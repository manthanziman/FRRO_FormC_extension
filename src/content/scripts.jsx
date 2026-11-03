import { fieldMap } from "../autofill/fieldMap";

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");

const controlSelector =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="password"]), select, textarea';

function isUsable(control) {
  return !control.disabled && control.getClientRects().length > 0;
}

function labelTexts(control) {
  const texts = [...(control.labels ?? [])].map((label) => label.innerText || label.textContent || "");
  if (control.getAttribute("aria-label")) texts.push(control.getAttribute("aria-label"));
  if (control.placeholder) texts.push(control.placeholder);
  if (control.id) {
    const external = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    if (external) texts.push(external.innerText || external.textContent || "");
  }
  const row = control.closest("tr, fieldset, li, [role='group'], .form-group");
  if (row) {
    texts.push(
      ...[...row.querySelectorAll("th, label, legend, [class*='label']")].map(
        (node) => node.innerText || node.textContent || "",
      ),
    );
    if (row.tagName === "TR") {
      const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
      const controlCell = control.closest("th, td");
      const controlCellIndex = cells.indexOf(controlCell);
      if (controlCellIndex > 0) {
        texts.push(...cells.slice(0, controlCellIndex).map((cell) => cell.innerText || cell.textContent || ""));
      }
      if (controlCell) {
        const range = document.createRange();
        range.selectNodeContents(controlCell);
        range.setEndBefore(control);
        texts.push(range.toString());
      }
    }
  }
  return texts.map(normalize).filter(Boolean);
}

function sectionFor(control) {
  const row = control.closest("tr");
  let previousRow = row?.previousElementSibling;
  while (previousRow) {
    if (previousRow.tagName === "TR") {
      const cells = [...previousRow.querySelectorAll(":scope > th, :scope > td")];
      const isSectionHeader = cells.length === 1 || cells.some((cell) => cell.colSpan > 1);
      if (isSectionHeader) {
        return normalize(previousRow.innerText || previousRow.textContent);
      }
    }
    previousRow = previousRow.previousElementSibling;
  }

  const fieldset = control.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend) return normalize(legend.innerText || legend.textContent);

  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  const previous = headings.filter(
    (heading) => heading.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  const heading = previous[previous.length - 1];
  return normalize(heading?.innerText || heading?.textContent);
}

function controlMatches(field, control, used, checkSection = true) {
  if (used.has(control) || !isUsable(control)) return false;
  if (field.type === "select" && control.tagName !== "SELECT") return false;
  if (field.type === "radio" && control.type !== "radio") return false;
  if (field.type === "checkbox" && control.type !== "checkbox") return false;
  if (field.type === "date" && control.tagName !== "INPUT" && control.tagName !== "TEXTAREA") return false;
  if (field.type === "text" && !(["text", "tel", "number", "email"].includes(control.type) || control.tagName === "TEXTAREA")) return false;

  if (field.regex) {
    const pattern = new RegExp(field.regex, "i");
    if (!labelTexts(control).some((text) => pattern.test(text))) return false;
  } else if (field.labels.length) {
    const aliases = field.labels.map(normalize);
    if (!labelTexts(control).some((text) => aliases.some((alias) => text === alias || text.includes(alias)))) return false;
  } else {
    return false;
  }

  if (!checkSection || !field.section) return true;
  const section = sectionFor(control);
  const expectedSection = normalize(field.section);
  return !section || section === expectedSection || section.includes(expectedSection);
}

function findControl(field, used = new Set()) {
  if (field.selector) {
    try {
      const selected = document.querySelector(field.selector);
      if (selected && isUsable(selected)) return selected;
    } catch (error) {
      console.warn("Invalid Form-C selector in field map", field.id, error);
    }
  }
  const controls = [...document.querySelectorAll(controlSelector)];
  return (
    controls.find((control) => controlMatches(field, control, used, true)) ??
    controls.find((control) => controlMatches(field, control, used, false))
  );
}

function optionsFor(control) {
  if (control.tagName === "SELECT") {
    return [...control.options]
      .filter((option) => option.value && !option.disabled)
      .map((option) => ({ value: option.value, label: option.label || option.textContent.trim() }));
  }
  if (control.type === "radio") {
    const group = [...document.querySelectorAll('input[type="radio"]')].filter(
      (radio) => radio.name === control.name,
    );
    return group.map((radio) => ({
      value: radio.value,
      label: radio.labels?.[0]?.innerText?.trim() || radio.value,
    }));
  }
  return [];
}

function describe(field, control) {
  const isRadioGroup = control?.type === "radio";
  const value = isRadioGroup
    ? [...document.querySelectorAll('input[type="radio"]')].find(
        (radio) => radio.name === control.name && radio.checked,
      )?.value
    : control?.value;
  return {
    found: Boolean(control),
    required: Boolean(control && (control.required || control.getAttribute("aria-required") === "true")),
    empty: !value,
    inputType: control?.type || field.type,
    options: control ? optionsFor(control) : [],
  };
}

function inspectForm() {
  const used = new Set();
  const fields = {};
  for (const field of fieldMap) {
    const control = findControl(field, used);
    if (control && control.type !== "radio") used.add(control);
    fields[field.id] = describe(field, control);
  }
  return { fields };
}

function setValue(control, value) {
  const prototype =
    control.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : control.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(control, value);
  else control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyFields(fields) {
  const result = { filled: [], skippedNoData: [], needsReview: [], failed: [] };
  const used = new Set();

  for (const item of fields) {
    if (item.needsReview) {
      result.needsReview.push(item.label);
      continue;
    }
    if (item.value === "" || item.value === null || item.value === undefined) {
      result.skippedNoData.push(item.label);
      continue;
    }

    const mapping = fieldMap.find((field) => field.id === item.id);
    const control = mapping && findControl(mapping, used);
    if (!control) {
      result.failed.push(item.label);
      continue;
    }

    if (control.type === "radio") {
      const group = [...document.querySelectorAll('input[type="radio"]')].filter(
        (radio) => radio.name === control.name,
      );
      const target = group.find(
        (radio) => normalize(radio.value) === normalize(item.value) ||
          normalize(radio.labels?.[0]?.innerText || "") === normalize(item.value),
      );
      if (!target) {
        result.needsReview.push(item.label);
        continue;
      }
      target.checked = true;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      result.filled.push(item.label);
      continue;
    }

    if (control.tagName === "SELECT") {
      const option = [...control.options].find((candidate) => candidate.value === String(item.value));
      if (!option) {
        result.needsReview.push(item.label);
        continue;
      }
    }
    if (control.type === "checkbox") {
      const checked = ["true", "1", "yes"].includes(normalize(item.value));
      control.checked = checked;
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      setValue(control, String(item.value));
    }
    used.add(control);
    result.filled.push(item.label);
  }
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "inspectForm") {
    sendResponse({ ok: true, ...inspectForm() });
    return false;
  }
  if (message?.type === "autofill") {
    sendResponse({ ok: true, result: applyFields(message.fields ?? []) });
    return false;
  }
  return false;
});
